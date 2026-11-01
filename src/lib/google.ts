import { createHmac } from 'node:crypto'

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'REQUEST_ERROR',
  ) {
    super(message)
  }
}

export type Actor = { id: number; version: number }

export function required(name: string) {
  const value = process.env[name]

  if (!value || value.length < 32 || value.includes('REPLACE')) {
    throw new AppError(
      `Falta configurar ${name} en el servidor.`,
      503,
      'CONFIG_MISSING',
    )
  }

  return value
}

export function googleScriptUrl() {
  const url = process.env.GOOGLE_SCRIPT_URL

  if (
    !url ||
    !/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url) ||
    url.includes('REPLACE')
  ) {
    throw new AppError(
      'Configura GOOGLE_SCRIPT_URL con la URL de la implementación de Apps Script que termina en /exec.',
      503,
      'GOOGLE_URL_INVALID',
    )
  }

  return url
}

export async function google<T = any>(
  action: string,
  data: unknown = {},
  actor?: Actor,
): Promise<T> {
  const url = googleScriptUrl()
  const payload = JSON.stringify({ action, data, actor })
  const ts = Date.now()

  const signature = createHmac('sha256', required('GOOGLE_API_SECRET'))
    .update(`${ts}.${payload}`)
    .digest('base64url')

  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, ts, signature }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    })

    if (!response.ok) {
      let instruction = 'Revisa la URL /exec y la implementación de Apps Script.'

      if ([401, 403].includes(response.status)) {
        instruction = 'Revisa el acceso de la implementación: ejecutar como propietario y acceso Cualquier persona.'
      } else if ([404, 410].includes(response.status)) {
        instruction = 'Copia la URL /exec de una implementación activa en GOOGLE_SCRIPT_URL y reinicia Next.js.'
      } else if (response.status === 429 || response.status >= 500) {
        instruction = 'Reintenta el mismo envío. Si persiste, revisa las ejecuciones de Apps Script.'
      }

      throw new AppError(
        `Google respondió HTTP ${response.status}. ${instruction}`,
        503,
        'GOOGLE_HTTP_ERROR',
      )
    }

    let reply: any

    try {
      reply = await response.json()
    } catch {
      throw new AppError(
        'Apps Script no devolvió JSON. Revisa que la implementación se ejecute como propietario y permita el acceso del servidor.',
        503,
        'GOOGLE_NOT_JSON',
      )
    }

    if (!reply || typeof reply.ok !== 'boolean') {
      throw new AppError(
        'La implementación de Apps Script no devuelve el formato de campaTeens. Revisa la URL y la versión desplegada.',
        502,
        'GOOGLE_RESPONSE_INVALID',
      )
    }

    if (!reply.ok) {
      const message = typeof reply.error === 'string'
        ? reply.error
        : 'Google no pudo confirmar la operación.'

      if (
        action === 'login' &&
        /^Inicia sesi[oó]n para continuar\.?$/i.test(message.trim())
      ) {
        throw new AppError(
          'Apps Script está pidiendo una sesión antes de validar el acceso. Revisa Code.gs y actualiza la implementación para que la acción login se atienda antes de exigir una sesión.',
          502,
          'GOOGLE_LOGIN_ROUTING',
        )
      }

      const status = Number(reply.status)

      throw new AppError(
        message,
        Number.isInteger(status) && status >= 400 && status <= 599 ? status : 503,
        'GOOGLE_APP_ERROR',
      )
    }

    return reply.data as T
  } catch (error) {
    if (error instanceof AppError) throw error

    const timedOut = error instanceof Error &&
      ['TimeoutError', 'AbortError'].includes(error.name)

    throw new AppError(
      timedOut
        ? 'Google tardó demasiado en responder. Reintenta el mismo envío.'
        : 'No se pudo conectar con Apps Script. Comprueba la conexión y la implementación.',
      503,
      timedOut ? 'GOOGLE_TIMEOUT' : 'GOOGLE_UNREACHABLE',
    )
  }
}