import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(
    req.nextUrl.hostname,
  )

  if (process.env.NODE_ENV !== 'development' || !local) {
    return NextResponse.json(
      { error: 'No disponible.' },
      { status: 404 },
    )
  }

  const value = process.env.AUTH_PEPPER

  const placeholder =
    /REPLACE|VALOR_ORIGINAL|PEGA_AQUI|TU_AUTH_PEPPER/i.test(
      value || '',
    )

  let causa = 'Variable cargada y con formato válido.'

  if (!value || !value.trim()) {
    causa = 'AUTH_PEPPER no está cargada en este servidor.'
  } else if (placeholder) {
    causa =
      'AUTH_PEPPER contiene un texto de ejemplo; falta su valor real.'
  } else if (value.length < 32) {
    causa = 'AUTH_PEPPER tiene menos de 32 caracteres.'
  }

  const valida = Boolean(
    value &&
    value.trim() &&
    value.length >= 32 &&
    !placeholder,
  )

  return NextResponse.json(
    {
      archivoEnvLocalExiste: existsSync(
        join(process.cwd(), '.env.local'),
      ),
      archivoEnvLocalTxtExiste: existsSync(
        join(process.cwd(), '.env.local.txt'),
      ),
      AUTH_PEPPER: {
        definida: Boolean(value),
        caracteres: value?.length || 0,
        valida,
        causa,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}