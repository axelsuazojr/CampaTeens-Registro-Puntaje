import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import sharp from 'sharp'
import { google, AppError } from '@/lib/google'
import { actorFrom, sameOrigin, passwordProof } from '@/lib/auth'
import { TEAMS } from '@/lib/rules'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const reply = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  })

async function prepareImage(
  file: File,
  kind: 'image' | 'logo',
): Promise<Buffer> {
  let stage = 'lectura'

  try {
    const bytes = Buffer.from(await file.arrayBuffer())

    const jpeg =
      bytes.length >= 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255

    const png =
      bytes.subarray(0, 8).toString('hex') ===
      '89504e470d0a1a0a'

    const webp =
      bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'

    if (!jpeg && !png && !webp) {
      throw new AppError(
        'El archivo no contiene una imagen JPG, PNG o WEBP válida. Expórtalo como PNG o JPG antes de subirlo.',
        415,
        'IMAGE_FORMAT',
      )
    }

    stage = 'metadatos'

    const image = sharp(bytes, {
      limitInputPixels: 64000000,
      failOn: 'warning',
      animated: false,
    })

    const metadata = await image.metadata()

    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > 64000000
    ) {
      throw new AppError(
        'La imagen supera el límite de 64 megapíxeles o tiene dimensiones inválidas. Reduce su resolución.',
        400,
        'IMAGE_DIMENSIONS',
      )
    }

    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '')) {
      throw new AppError(
        'El formato real del archivo no es JPG, PNG o WEBP.',
        415,
        'IMAGE_FORMAT',
      )
    }

    stage = 'conversión'

    const output = await image
      .rotate()
      .resize(512, 512, {
        fit: kind === 'logo' ? 'contain' : 'cover',
        background: {
          r: 0,
          g: 0,
          b: 0,
          alpha: 0,
        },
      })
      .toColourspace('srgb')
      .webp({ quality: 88 })
      .toBuffer()

    if (output.length > 2 * 1024 * 1024) {
      throw new AppError(
        'La imagen procesada supera los 2 MB. Usa una imagen más sencilla.',
        413,
        'IMAGE_TOO_LARGE',
      )
    }

    return output
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    const detail =
      error instanceof Error ? error.message : String(error)

    console.error('[campaTeens:image]', {
      stage,
      detail,
    })

    if (/pixel limit/i.test(detail)) {
      throw new AppError(
        'La imagen supera el límite de 64 megapíxeles. Reduce su resolución.',
        400,
        'IMAGE_DIMENSIONS',
      )
    }

    const invalid =
      stage !== 'conversión' ||
      /corrupt|truncat|premature|invalid|unsupported image|not enough|read error|end of|bad header|jpegload|pngload|webpload|libspng|vipsjpeg/i.test(
        detail,
      )

    throw new AppError(
      invalid
        ? 'La imagen está dañada o incompleta. Ábrela y vuelve a guardarla como PNG o JPG.'
        : 'El servidor no pudo convertir la imagen. Revisa el detalle [campaTeens:image] en la terminal de Next.js.',
      invalid ? 400 : 500,
      invalid ? 'IMAGE_DECODE_FAILED' : 'IMAGE_PROCESSING_FAILED',
    )
  }
}

async function handle(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ path: string[] }>
  },
) {
  try {
    const path = (await params).path.join('/')
    const actor = actorFrom(req)

    if (req.method === 'GET') {
      if (['state', 'judges'].includes(path)) {
        return reply(await google(path, {}, actor))
      }

      if (path === 'team-image' || path === 'logo-image') {
        const result = await google<{
          base64: string
          mime: string
          fileId?: string
        }>(
          path === 'logo-image' ? 'logo-read' : 'image-read',
          {
            team: req.nextUrl.searchParams.get('team'),
          },
          actor,
        )

        if (result.mime !== 'image/webp') {
          throw new AppError('Formato de imagen inválido.', 400)
        }

        const versioned =
          !!result.fileId &&
          req.nextUrl.searchParams.get('v') === result.fileId

        return new NextResponse(
          Buffer.from(result.base64, 'base64'),
          {
            headers: {
              'Content-Type': 'image/webp',

              'Cache-Control': versioned
                ? 'private, max-age=86400, immutable'
                : 'private, no-store',

              Vary: 'Cookie',
              'X-Content-Type-Options': 'nosniff',
            },
          },
        )
      }

      if (path === 'export') {
        const rows = await google<any[]>('export', {}, actor)

        const cell = (value: unknown) => {
          if (typeof value === 'number') {
            return String(value)
          }

          let text = String(value ?? '')

          if (/^[=+@\-\t\r]/.test(text)) {
            text = "'" + text
          }

          return '"' + text.replaceAll('"', '""') + '"'
        }

        const csv =
          '\uFEFF' +
          [
            [
              'Fecha',
              'Equipo',
              'Puntos',
              'Categoría',
              'Motivo',
              'Juez',
              'Juego',
              'ID',
            ],
            ...rows.map((row) => [
              row.created_at,
              TEAMS.find((team) => team.id === row.team_slug)?.name,
              row.delta,
              row.category_label,
              row.reason,
              row.judge_name,
              row.round_name,
              row.id,
            ]),
          ]
            .map((row) => row.map(cell).join(','))
            .join('\r\n')

        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv;charset=utf-8',
            'Content-Disposition':
              'attachment; filename="puntajes.csv"',
            'Cache-Control': 'no-store',
          },
        })
      }
    }

    if (req.method === 'POST') {
      sameOrigin(req)

      if (path === 'image' || path === 'logo') {
        const form = await req.formData()

        const file = form.get('file')
        const team = String(form.get('team'))
        const operationId = z.uuid().parse(form.get('operationId'))

        if (!(file instanceof File) || file.size === 0) {
          throw new AppError(
            'Selecciona una imagen JPG, PNG o WEBP que no esté vacía.',
            400,
            'IMAGE_FILE_REQUIRED',
          )
        }

        if (file.size > 2 * 1024 * 1024) {
          throw new AppError(
            'La imagen debe pesar hasta 2 MB.',
            413,
            'IMAGE_TOO_LARGE',
          )
        }

        if (
          path === 'image' &&
          !TEAMS.some((item) => item.id === team)
        ) {
          throw new AppError(
            'Equipo inválido.',
            400,
            'IMAGE_TEAM_INVALID',
          )
        }

        // Verifica que la persona sea administradora.
        await google('judges', {}, actor)

        const data = await prepareImage(file, path)

        return reply(
          await google(
            path,
            {
              operationId,
              team,
              mime: 'image/webp',
              base64: data.toString('base64'),
            },
            actor,
          ),
        )
      }

      const data = await req.json()

      if (
        [
          'move',
          'award',
          'reverse',
          'round',
          'judge-status',
          'category-create',
          'category-update',
          'category-delete',
          'logo-remove',
        ].includes(path)
      ) {
        z.uuid().parse(data.operationId)

        return reply(await google(path, data, actor))
      }

      if (path === 'judge') {
        const parsed = z.object({
          operationId: z.uuid(),
          name: z.string().trim().min(2).max(80),
          email: z.email().max(150),
          password: z.string().min(12).max(128),
          role: z.enum(['judge', 'admin']),
        }).parse(data)

        const { password, ...safe } = parsed

        return reply(
          await google(
            'judge',
            {
              ...safe,
              email: parsed.email.toLowerCase(),
              passwordHash: await passwordProof(
                password,
                parsed.email,
              ),
            },
            actor,
          ),
        )
      }

      if (path === 'judge-password') {
        const parsed = z.object({
          operationId: z.uuid(),
          id: z.number().int().positive(),
          password: z.string().min(12).max(128),
        }).parse(data)

        const judges = await google<any[]>('judges', {}, actor)

        const target = judges.find(
          (judge) => Number(judge.id) === parsed.id,
        )

        if (!target) {
          throw new AppError('Persona no encontrada.', 404)
        }

        return reply(
          await google(
            'judge-password',
            {
              operationId: parsed.operationId,
              id: parsed.id,
              passwordHash: await passwordProof(
                parsed.password,
                target.email,
              ),
            },
            actor,
          ),
        )
      }
    }

    throw new AppError('Ruta no encontrada.', 404)
  } catch (error) {
    return reply(
      {
        error:
          error instanceof z.ZodError
            ? 'Revisa los datos del formulario.'
            : error instanceof AppError
              ? error.message
              : 'No se pudo confirmar la operación. Reintenta el mismo envío.',

        code:
          error instanceof z.ZodError
            ? 'INPUT_INVALID'
            : error instanceof AppError
              ? error.code
              : 'CONTROL_UNEXPECTED',

        source: 'control',
        endpoint: req.nextUrl.pathname,
      },
      error instanceof AppError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 503,
    )
  }
}

export const GET = handle
export const POST = handle