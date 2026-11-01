import {
  createHmac,
  timingSafeEqual,
  scrypt,
  randomBytes,
} from 'node:crypto'
import { promisify } from 'node:util'
import type { NextRequest } from 'next/server'
import { AppError, required, type Actor } from './google'

const derive = promisify(scrypt)
const SESSION_DURATION = 8 * 60 * 60 * 1000

export const COOKIE = 'punto-session'

function authError(message: string, status: number, code: string) {
  return Object.assign(new AppError(message, status), { code })
}

export function appOrigin() {
  const configured = process.env.APP_URL?.trim()

  const value = configured || (
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000'
      : ''
  )

  if (!value) {
    throw authError('Configura APP_URL.', 503, 'CONFIG_MISSING')
  }

  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw authError(
      'APP_URL debe ser una URL válida.',
      503,
      'APP_URL_INVALID',
    )
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw authError(
      'APP_URL debe contener solo el origen, por ejemplo http://localhost:3000.',
      503,
      'APP_URL_INVALID',
    )
  }

  return url.origin
}

export async function passwordProof(password: string, email: string) {
  const salt = `${email.trim().toLowerCase()}:${required('AUTH_PEPPER')}`
  const hash = await derive(password, salt, 64) as Buffer

  return hash.toString('hex')
}

export function sessionToken(actor: Actor, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    ...actor,
    exp: now + SESSION_DURATION,
    nonce: randomBytes(16).toString('hex'),
  })).toString('base64url')

  const signature = createHmac('sha256', required('SESSION_SECRET'))
    .update(payload)
    .digest('base64url')

  return `${payload}.${signature}`
}

export function verifySession(token: string, now = Date.now()): Actor {
  try {
    const [payload, signature, extra] = token.split('.')

    if (!payload || !signature || extra) {
      throw new Error('Invalid token')
    }

    const received = Buffer.from(signature, 'base64url')

    const expected = createHmac('sha256', required('SESSION_SECRET'))
      .update(payload)
      .digest()

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new Error('Invalid signature')
    }

    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    )

    if (
      !Number.isInteger(data.id) ||
      data.id < 1 ||
      !Number.isInteger(data.version) ||
      data.version < 1 ||
      !Number.isFinite(data.exp) ||
      data.exp <= now
    ) {
      throw new Error('Invalid session')
    }

    return {
      id: data.id,
      version: data.version,
    }
  } catch (error) {
    if (error instanceof AppError) throw error

    throw authError(
      'Inicia sesión para continuar.',
      401,
      'AUTH_REQUIRED',
    )
  }
}

export function actorFrom(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value

  if (!token) {
    throw authError(
      'Inicia sesión para continuar.',
      401,
      'AUTH_REQUIRED',
    )
  }

  return verifySession(token)
}

export function sameOrigin(req: NextRequest) {
  if (req.headers.get('origin') !== appOrigin()) {
    throw authError(
      'Origen no autorizado.',
      403,
      'ORIGIN_INVALID',
    )
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: appOrigin().startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_DURATION / 1000,
  }
}