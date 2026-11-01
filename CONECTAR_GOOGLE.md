# Conectar tu cuenta de Google

La adaptación está preparada como código. Estos pasos crean los archivos en **tu** Drive y conectan la página con ellos. No envíes tu contraseña de Google ni las claves del proyecto por chat.

## 1. Preparar la configuración inicial

En una computadora, descomprime el ZIP, entra a `campateens` e instala Node.js 24.22.1 o posterior. Abre una terminal en esa carpeta:

```bash
npm ci
npm run google:config
```

El asistente pedirá el correo y una contraseña para el **administrador de campaTeens**. No tiene que ser tu contraseña de Google; utiliza una distinta. La contraseña se introduce sin mostrarse en pantalla.

El asistente entrega dos grupos de valores. Guárdalos en privado. La contraseña original no se imprime ni se guarda; el asistente genera su hash.

## 2. Crear el proyecto de Apps Script

1. Entra a [script.google.com](https://script.google.com/) con la cuenta de Google donde deseas guardar los datos.
2. Crea un proyecto nuevo y llámalo **campaTeens – Control de puntajes**.
3. Copia el contenido de `apps-script/Code.gs` al archivo `Code.gs` del editor.
4. Agrega otro archivo de código y llámalo **Core**. Pega el contenido de `apps-script/Core.js` allí. Apps Script lo mostrará como `Core.gs`; es correcto.
5. En Configuración del proyecto, activa **Mostrar el archivo de manifiesto appsscript.json en el editor**. Sustituye su contenido por el archivo incluido `apps-script/appsscript.json`.
6. Comprueba en **Servicios** que esté añadido **Google Sheets API**, versión v4, con identificador `Sheets`. Si no aparece, agrégalo con el botón `+`. Si usas un proyecto de Google Cloud propio, habilita también Sheets API en ese proyecto.

## 3. Agregar las propiedades del script

En Configuración del proyecto → Propiedades de la secuencia de comandos, agrega los valores del primer grupo del asistente:

| Propiedad | Valor |
| --- | --- |
| API_SECRET | La clave generada por el asistente |
| ADMIN_EMAIL | El correo del administrador de campaTeens |
| ADMIN_HASH | El hash generado, de 128 caracteres |
| ADMIN_NAME | El nombre que deseas mostrar |

No pegues la contraseña original en ninguna propiedad.

Deja `SPREADSHEET_ID` e `IMAGES_FOLDER_ID` sin configurar para que se creen automáticamente. Después de la configuración aparecerán con sus IDs. Si decides introducir IDs propios, deben corresponder a archivos privados donde el propietario del script tenga permiso de escritura.

## 4. Crear las hojas y la carpeta

1. Guarda el proyecto.
2. Selecciona la función **configurarCampaTeens** y pulsa **Ejecutar**.
3. Autoriza a tu proyecto a acceder a Sheets y Drive cuando Google lo solicite.
4. El registro de ejecución mostrará el enlace de la nueva planilla. En tu Drive aparecerá también **campaTeens · Imágenes de equipos**.
5. Confirma que la planilla tenga Equipos, Jueces, Juegos, Movimientos, Operaciones, Categorias y Configuracion. Puede conservar una hoja inicial vacía: no afecta a la aplicación.

No publiques ni compartas la planilla o la carpeta de imágenes. Los jueces ingresarán desde la página de campaTeens.

## 5. Publicar Apps Script como aplicación web

1. Pulsa **Implementar → Nueva implementación**.
2. Selecciona **Aplicación web**.
3. En **Ejecutar como**, elige **Yo** (propietario del proyecto).
4. En **Quién tiene acceso**, selecciona **Cualquier persona**. El endpoint verifica la firma de cada solicitud; la planilla y las imágenes continúan privadas.
5. Implementa y copia la dirección que termina en **/exec**. No uses la dirección `/dev`.

Si tu cuenta institucional no ofrece “Cualquier persona”, esta configuración no funcionará tal como está. Necesitarás autorización de tu administrador de Workspace o una cuenta que permita ese despliegue. No cambies los permisos de la planilla para intentar resolverlo.

Después de cambiar el código, utiliza **Administrar implementaciones → Editar → Nueva versión** para actualizar el despliegue existente. Usa siempre el mismo proyecto para todos los jueces.

## 6. Configurar y abrir Next.js

En la carpeta del proyecto, crea `.env.local` con el segundo grupo de valores del asistente:

```dotenv
APP_URL=http://localhost:3000
GOOGLE_SCRIPT_URL=PEGA_LA_URL_REAL_QUE_TERMINA_EN_EXEC
GOOGLE_API_SECRET=LA_MISMA_API_SECRET_DEL_SCRIPT
SESSION_SECRET=EL_VALOR_GENERADO
AUTH_PEPPER=EL_VALOR_GENERADO
```

No agregues el prefijo `NEXT_PUBLIC_` a ninguna clave. No incluyas `.env.local` en un repositorio ni lo compartas con los jueces.

Ejecuta:

```bash
npm run dev
```

Abre `http://localhost:3000` e inicia sesión con el correo y contraseña de campaTeens elegidos en el paso 1. En **Usuarios**, agrega a las personas con sus nombres y roles. En **Equipos**, carga sus imágenes.

## 7. Utilizarlo desde varios dispositivos

Todos deben acceder a **la misma URL de Next.js**. Para publicarlo, utiliza un alojamiento compatible con Next.js y Node, configura allí las mismas cinco variables y ajusta `APP_URL` a su dominio HTTPS exacto.

Para una red local, puedes ejecutar la aplicación en una computadora y usar su IP, por ejemplo `http://IP_DE_LA_COMPUTADORA:3000`; configura `APP_URL` con esa dirección y reinicia la aplicación. Necesita conectividad con Google. No abras `localhost` desde cada celular: apuntaría al propio teléfono.

No necesitas una conexión de Google Drive distinta en cada dispositivo. El propietario autoriza Apps Script una vez; los jueces usan sus cuentas de campaTeens.

## 8. Probar antes del evento

Usa una **planilla/proyecto de ensayo separado**, no el del encuentro real:

1. Ingresa en dos dispositivos con dos jueces distintos.
2. Selecciona Otorgar puntos → Juego limpio y registra 10 para Tiburones desde ambos, lo más simultáneamente posible. Deben aparecer dos movimientos y +20.
3. Comprueba que el juez solo vea Registrar puntos y Marcador. Desde administración, intenta repartir lugares al mismo juego desde dos pestañas: solo debe aceptarse un reparto de seis movimientos.
4. Anula un movimiento desde administración y comprueba que aparece la compensación y se conserva el original.
5. Desactiva un juez y verifica que su sesión deja de permitir registros.
6. Carga un escudo y comprueba que se muestra desde el otro dispositivo.
7. Si aparece un envío pendiente, usa **Reintentar**; no hagas un nuevo registro equivalente con otra referencia.

Para iniciar el encuentro limpio, usa una planilla y carpeta nuevas con su propio proyecto/IDs. No borres filas manualmente para reiniciar el marcador: podrías conservar referencias que ya no correspondan al historial.

## Recuperación y respaldo

- Guarda `AUTH_PEPPER`, `SESSION_SECRET`, `API_SECRET` y el acceso al proyecto en un lugar privado. Mantén iguales las claves al cambiar de servidor. Si cambia `AUTH_PEPPER`, las contraseñas existentes dejan de coincidir y deben restablecerse.
- Un administrador puede cambiar las contraseñas desde **Usuarios → Contraseña**. El cambio invalida sesiones anteriores.
- Si pierdes todas las cuentas administrativas, el propietario puede recuperar el acceso desde la hoja Jueces con un hash nuevo y la misma `AUTH_PEPPER`, tras guardar un respaldo. No vuelvas a generar toda la configuración encima del evento.
- Haz copias privadas de la planilla y de la carpeta de imágenes. Conserva Operaciones junto con Movimientos; la prevención de duplicados depende de ambas.
- No distribuyas copias del proyecto de Apps Script para escribir en la misma planilla. Su bloqueo se limita al proyecto que lo ejecuta.

## Problemas frecuentes

| Mensaje o situación | Revisión |
| --- | --- |
| Falta configurar la conexión de Google | Verifica `GOOGLE_SCRIPT_URL`; debe ser la URL de implementación `/exec` |
| Solicitud no autorizada | Comprueba que `GOOGLE_API_SECRET` y `API_SECRET` sean idénticas |
| Origen no autorizado | Ajusta `APP_URL` a la dirección exacta desde la que abres la página y reinicia |
| Google no confirmó / respuesta HTML | Revisa el despliegue: ejecutar como propietario y acceso Cualquier persona |
| Sheets no está definido | Activa el servicio avanzado Google Sheets API v4 con identificador Sheets |
| Campos o encabezados no coinciden | Restaura los encabezados originales; no los traduzcas ni reordenes |
| Contraseña incorrecta tras reinstalar | Recupera la misma `AUTH_PEPPER` del servidor anterior |
| Hay otros registros en curso | Espera unos segundos y usa Reintentar con el mismo envío |
| Cuota de Google alcanzada | Espera la recuperación de la cuota; el envío no se mostrará como confirmado |

## Actualizar desde la versión anterior

1. Guarda un respaldo privado de la planilla, las imágenes y las claves.
2. Conserva el mismo proyecto de Apps Script y las propiedades `SPREADSHEET_ID`, `IMAGES_FOLDER_ID`, `API_SECRET`, `AUTH_PEPPER` y `SESSION_SECRET` del servidor. No ejecutes otra vez el asistente de claves.
3. Sustituye los contenidos de Core.gs y Code.gs por esta versión.
4. Ejecuta `configurarCampaTeens`. Agregará Categorias, Configuracion y dos columnas al final de Movimientos; conserva las filas existentes. Detiene la actualización si encuentra encabezados incompatibles.
5. Actualiza la implementación de Apps Script con una nueva versión del mismo despliegue y publica esta versión de Next.js. Evita usar simultáneamente las dos versiones durante la actualización.
6. Las categorías del PDF se cargan una sola vez. Repetir la configuración no restaura categorías que el administrador haya quitado. Los registros viejos conservan sus valores originales; no se recalculan con las nuevas sugerencias.
7. Confirma los envíos pendientes de la versión anterior antes de actualizar. El nuevo formulario requiere una categoría válida; no convierte automáticamente una solicitud antigua sin categoría.

En la app, entra como administrador a **Logo** para agregar el logo general y a **Categorías** para crear, editar o quitar motivos de registro. El juez selecciona una categoría e ingresa una cantidad positiva; el sistema aplica el signo según Otorgar o Quitar. La sugerencia puede cambiarse manualmente al registrar.
