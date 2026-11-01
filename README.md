# campaTeens — Control de puntajes

Aplicación minimalista en español con Next.js, React y shadcn/ui. Los datos se guardan en Google Sheets y las imágenes en una carpeta privada de Drive. Apps Script coordina el acceso. No usa Payload ni PostgreSQL.

## Cambios de esta versión

- Nombre de la app: **campaTeens**.
- Logo general editable desde **Logo**, solo por administración. Se conserva la transparencia y se muestra a todos los usuarios autenticados.
- Dos roles, con permisos comprobados tanto en la interfaz como en Apps Script.
- Categorías editables en lugar de motivos fijos en el código.
- Registro manual: equipo → otorgar/quitar → categoría → cantidad → observación opcional → confirmar.
- 22 categorías con las sugerencias de puntos del PDF y una categoría manual adicional, Trabajo en equipo.
- Las categorías retiradas no aparecen en el selector. Los movimientos originales se conservan.

## Roles

| Función | Administrador | Juez |
| --- | --- | --- |
| Otorgar y quitar puntos por categoría | Sí | Sí |
| Ingresar la cantidad manualmente | Sí | Sí |
| Consultar clasificación | Sí | Sí |
| Crear, editar y quitar categorías | Sí | No |
| Crear juegos y repartir lugares | Sí | No |
| Historial completo, exportación y anulación | Sí | No |
| Imágenes de equipos y logo general | Sí | No |
| Crear/desactivar usuarios y cambiar contraseñas | Sí | No |

El juez solo tiene las pantallas Registrar puntos y Marcador. Su estado devuelve sus propios movimientos recientes; no el historial de los otros jueces, ni los juegos de administración. No puede cambiar permisos enviando directamente una solicitud a la API.

## Conectar y ejecutar

Sigue **[CONECTAR_GOOGLE.md](CONECTAR_GOOGLE.md)** para crear el proyecto y autorizar tu cuenta. No se ha conectado esta versión a una cuenta real ni publicado la página.

Requisitos: Node.js 24.22.1 o superior, una cuenta que permita desplegar una aplicación web de Apps Script y un alojamiento compatible con Next.js/Node.

```bash
npm ci
npm run google:config
# Configura Apps Script y .env.local siguiendo el instructivo.
npm run dev
```

Producción:

```bash
npm run build
npm start
```

O utiliza `docker compose up --build -d` con las variables en `.env.local`. Drive guarda los datos, pero la página Next.js necesita alojamiento. Todos los dispositivos deben usar la misma URL y el mismo proyecto de Apps Script.

## Categorías y cantidades

Las categorías iniciales provienen únicamente del sistema de puntuación del PDF. Se conservan sus cantidades como sugerencia, incluidos +30 por terminar primero, +25 por buena actitud y −60 por trampa. Consulta **[CATEGORIAS_INICIALES.md](CATEGORIAS_INICIALES.md)** para la lista completa.

Administración puede crear una categoría, elegir Otorgar o Quitar y establecer una cantidad sugerida entre 0 y 10,000. El valor 0 significa sin sugerencia. El juez siempre registra una cantidad entera positiva entre 1 y 10,000; el servidor determina el signo por el tipo de categoría. Todas las cantidades sugeridas pueden ajustarse al registrar.

Editar una categoría incrementa su versión. Si un juez tenía abierta una versión anterior, el servidor rechaza el envío y pide actualizar; no cambia silenciosamente el motivo o el signo. El nombre de la categoría se copia en el movimiento, de modo que una edición o retiro posterior no altera el historial.

El reparto de posiciones conserva 600, 450, 350, 300, 250 y 100. Se guarda completo y una sola vez por juego, exclusivamente por administración. No hay transferencias automáticas por pañoletas/banderas: registra por separado los equipos que ganan y los que pierden puntos.

## Datos compartidos y duplicados

La planilla privada contiene Equipos, Jueces, Juegos, Movimientos, Operaciones, Categorias y Configuracion. La actualización desde la versión anterior agrega las hojas y columnas necesarias sin borrar los registros existentes. Ejecuta `configurarCampaTeens` antes de actualizar el despliegue; consulta el instructivo. La semilla de categorías solo se carga una vez y no resucita categorías quitadas.

Apps Script obtiene un **ScriptLock** antes de leer, validar y guardar. Todos los dispositivos deben utilizar el mismo proyecto. Los cambios, el movimiento y su UUID de operación se envían en una única llamada `Sheets.Spreadsheets.batchUpdate`, aplicada de forma conjunta. Un reintento con el mismo UUID, contenido y juez se reconoce sin duplicar puntos; un contenido distinto devuelve conflicto.

La interfaz solo anuncia éxito después de la confirmación. Si se pierde la respuesta, guarda el envío pendiente y su UUID en la sesión de la pestaña para reintentarlo. No cierres esa pestaña hasta resolver el pendiente. No se registran puntos sin Internet.

Las anulaciones agregan una compensación; no borran el original. Cada movimiento solo puede anularse una vez. Un juego puntuado permanece marcado como tal; las correcciones se hacen mediante anulaciones y nuevos registros manuales.

El marcador se consulta cada 15 segundos y al volver a la pestaña; después de una escritura se solicita el estado actualizado. No es una conexión instantánea por WebSocket. Google impone cuotas y límites de ejecución: esta solución se orienta a un encuentro con pocos jueces y una cantidad moderada de movimientos, no a carga ilimitada.

No edites los encabezados ni el historial directamente en Sheets. El propietario conserva la capacidad de edición, pero las escrituras manuales y otras integraciones no respetan el bloqueo de esta app. No compartas permisos de edición de la planilla con los jueces.

## Acceso e imágenes

Las contraseñas se derivan con scrypt y AUTH_PEPPER. El servidor conserva las claves en variables privadas; nunca con prefijo NEXT_PUBLIC_. La cookie es HttpOnly y SameSite=Lax, y Secure con HTTPS. Los cambios de contraseña y desactivaciones invalidan la versión de sesión anterior.

Las solicitudes a Apps Script se firman con HMAC y vencimiento. El despliegue se ejecuta como propietario y permite solicitudes externas, pero rechaza llamadas sin firma. Esto no hace pública la planilla ni la carpeta. Algunos dominios Workspace impiden este tipo de despliegue; revisa el instructivo.

Logos y escudos aceptan JPG, PNG o WEBP de hasta 2 MB. Se validan y convierten a WEBP de 512 × 512; los logos se encajan sin recortarlos y con fondo transparente. El servidor entrega las imágenes tras comprobar la sesión. Cambiar una imagen no altera los puntajes; si dos administradores la cambian, prevalece la última guardada.

## Verificación

```bash
npm test
npm run typecheck
npm run build
```

Los tests ejecutan los archivos Core.js y Code.gs reales con adaptadores de Google simulados. Cubren idempotencia, pérdida de confirmación, permisos de ambos roles, categorías editadas/retiradas, migración de hojas, logo, anulaciones y reparto atómico. No sustituyen una prueba con tu cuenta y dos dispositivos. Antes del evento, verifica esas condiciones en una instalación de ensayo.

## Archivos

- `apps-script/Core.js`: reglas, roles, categorías y registro.
- `apps-script/Code.gs`: acceso, firma, bloqueo y almacenamiento.
- `src/config/default-categories.json`: categorías iniciales.
- `src/components/dashboard.tsx`: interfaz.
- `src/app/api/`: servidor de la app.
- `scripts/google-config.mjs`: configuración inicial de claves.
- `CONECTAR_GOOGLE.md`: instalación y actualización.

Referencias oficiales: [LockService](https://developers.google.com/apps-script/reference/lock), [Sheets batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate), [Apps Script web](https://developers.google.com/apps-script/guides/web), [cuotas](https://developers.google.com/apps-script/guides/services/quotas).
