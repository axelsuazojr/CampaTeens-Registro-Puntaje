import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ORIGEN = 'http://localhost:3000'
const RUTA = '/api/auth/login'

export async function diagnosticarLogin(enviar = globalThis.fetch) {
  try {
    const respuesta = await enviar(`${ORIGEN}${RUTA}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGEN,
      },
      body: JSON.stringify({
        email: `diagnostico-${randomUUID()}@campateens.invalid`,
        password: randomUUID(),
      }),
      signal: AbortSignal.timeout(30000),
    })

    let datos

    try {
      datos = await respuesta.json()
    } catch {
      return {
        estado: respuesta.status,
        ruta: RUTA,
        codigo: 'RESPUESTA_NO_JSON',
        mensaje: 'El servidor no devolvió una respuesta JSON.',
        siguientePaso: 'Revisa la terminal donde ejecutaste npm run dev.',
      }
    }

    const mensaje = typeof datos?.error === 'string'
      ? datos.error.slice(0, 800)
      : 'La respuesta no contiene un mensaje de error.'

    let siguientePaso = 'Copia este resultado para identificar la causa.'

    if (/APP_URL|Origen no autorizado/i.test(mensaje)) {
      siguientePaso =
        'En .env.local, junto a package.json, configura APP_URL=http://localhost:3000 y reinicia npm run dev. Conserva las demás variables.'
    } else if (/AUTH_PEPPER|SESSION_SECRET|GOOGLE_API_SECRET/i.test(mensaje)) {
      siguientePaso =
        'Revisa la variable indicada en .env.local. Usa su valor original y reinicia el servidor; no regeneres las claves de cuentas existentes.'
    } else if (/Inicia sesión para continuar|sesión antes de/i.test(mensaje)) {
      siguientePaso =
        'La petición login está exigiendo una sesión previa. Revisa que Code.gs atienda login antes de autenticar las demás acciones y que la implementación publicada tenga esa versión.'
    } else if (
      respuesta.status === 401 &&
      /Correo o contraseña incorrectos/i.test(mensaje)
    ) {
      siguientePaso =
        'La ruta respondió y rechazó correctamente la cuenta ficticia. Prueba ahora tu cuenta real; esta comprobación no verifica tu contraseña.'
    } else if (respuesta.status === 200) {
      siguientePaso =
        'La cuenta ficticia fue aceptada. Revisa la autenticación del servidor antes de usar esta implementación.'
    }

    return {
      estado: respuesta.status,
      ruta: RUTA,
      codigo: typeof datos?.code === 'string'
        ? datos.code.slice(0, 100)
        : 'SIN_CODIGO',
      mensaje,
      siguientePaso,
    }
  } catch (error) {
    const demora = ['TimeoutError', 'AbortError'].includes(error?.name)

    return {
      estado: null,
      ruta: RUTA,
      codigo: demora ? 'TIEMPO_AGOTADO' : 'SIN_CONEXION',
      mensaje: demora
        ? 'El servidor no respondió dentro de 30 segundos.'
        : 'No se pudo conectar con localhost:3000.',
      siguientePaso:
        'Ejecuta npm run dev, déjalo abierto y ejecuta esta comprobación desde otra terminal.',
    }
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  console.log(JSON.stringify(await diagnosticarLogin(), null, 2))
}