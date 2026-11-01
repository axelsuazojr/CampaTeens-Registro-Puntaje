# Verificación de campaTeens

- 23 pruebas automatizadas aprobadas, usando el motor de Apps Script con servicios de Google simulados.
- Comprobación de tipos TypeScript aprobada.
- Compilación de producción Next.js aprobada.
- Interacciones de la demostración comprobadas con un DOM simulado: sumar, quitar, selección de rol, categorías y logo.
- No se conectó esta versión a una cuenta real de Google, ni se publicó una URL.

Se cubrieron reintentos con UUID, fallos antes/después de guardar, firma, permisos de ambos roles, historial propio del juez, reparto único por juego, anulaciones únicas, versiones de categorías, retiro de categorías sin perder movimientos, carga privada de logo e imágenes, y actualización del esquema anterior sin perder filas.

Pendiente de verificar en la instalación final: cuotas y respuesta real de Apps Script, carga de imágenes real en Drive y registros simultáneos desde dos dispositivos. La demostración visual usa datos locales de ejemplo y no almacena datos del encuentro.
