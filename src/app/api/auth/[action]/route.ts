import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { google, AppError, required } from '@/lib/google'
import {
  COOKIE,
  sameOrigin,
  passwordProof,
  sessionToken,
  cookieOptions,
} from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    sameOrigin(req)

    const { action } = await params

    if (action === 'logout') {
      const response = NextResponse.json(
        { ok: true },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      )

      response.cookies.set(COOKIE, '', {
        ...cookieOptions(),
        maxAge: 0,
      })

      return response
    }

    if (action !== 'login') {
      throw new AppError('Ruta no encontrada.', 404)
    }

    required('SESSION_SECRET')

    const data = z.object({
      email: z.email().max(150),
      password: z.string().min(1).max(128),
    }).parse(await req.json())

    const raw = await google<unknown>('login', {
      email: data.email.toLowerCase(),
      proof: await passwordProof(data.password, data.email),
    })

    const parsed = z.object({
      id: z.number().int().positive(),
      name: z.string().min(1),
      role: z.enum(['admin', 'judge']),
      version: z.number().int().positive(),
    }).safeParse(raw)

    if (!parsed.success) {
      throw new AppError(
        'La respuesta de acceso de Apps Script está incompleta. Comprueba la versión de la implementación.',
        502,
        'GOOGLE_RESPONSE_INVALID',
      )
    }

    const user = parsed.data

    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )

    response.cookies.set(
      COOKIE,
      sessionToken({
        id: user.id,
        version: user.version,
      }),
      cookieOptions(),
    )

    return response
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? 'Revisa tu correo y contraseña.'
            : error instanceof AppError
              ? error.message
              : 'No se pudo iniciar sesión.',

        code:
          error instanceof z.ZodError
            ? 'INPUT_INVALID'
            : error instanceof AppError
              ? error.code
              : 'AUTH_UNEXPECTED',

        source: 'auth',
        endpoint: req.nextUrl.pathname,
      },
      {
        status:
          error instanceof AppError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 503,

        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  }
}