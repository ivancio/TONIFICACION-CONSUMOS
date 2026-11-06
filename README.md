# TONIFICACION-CONSUMOS

App para registrar sesiones de los dos decoradores. La web y la API se publican
en un mismo Cloudflare Worker; D1 conserva una copia compartida. Cada navegador
mantiene tambien sus datos locales y confirma una subida solo tras releer D1.

## Instalar en Android

Abre el enlace privado completo (`.../#clave=...`) en Chrome para Android, no
en el navegador integrado de otra app. La app comprueba la clave una vez y la
retira de la barra de direcciones. Usa el boton
"Instalar app" si aparece, o el menu de Chrome (tres puntos) > "Instalar
aplicacion" / "Anadir a pantalla de inicio". La instalacion no borra los registros.

La clave se guarda en el navegador para las proximas aperturas. Una persona
con el enlace puede leer y modificar todos los registros: no lo publiques ni
lo reenvies fuera del equipo. Rotar `SHARE_KEY` invalida todos los enlaces.

## Primera puesta en marcha

1. `npm install`
2. `npx wrangler d1 migrations apply tonificacion-consumos --remote`
3. Genera una clave aleatoria larga y configurala como secreto del Worker con
   `npx wrangler secret put SHARE_KEY`. Nunca la incluyas en Git ni en
   `wrangler.jsonc`.
4. `npm run deploy`
5. El Worker nuevo es publico solo para HTML e iconos. Todas las rutas `/api/`
   exigen la clave. La URL anterior con Cloudflare Access se conserva como
   respaldo y usa la misma base D1.

El Worker compartido esta en
`https://tonificacion-consumos-compartida.espinosa-surface.workers.dev/`.
La URL anterior es `https://tonificacion-consumos.espinosa-surface.workers.dev/`.

## Pasar datos del sitio anterior

En el movil que contiene los datos antiguos, descarga "Copia de seguridad"
desde la pantalla inicial. Abre el nuevo enlace privado y usa
"Restaurar copia" para importar el JSON. Comprueba "Confirmado en la nube"
antes de usar otro movil. Repite la importacion con cualquier otro movil que
tenga registros locales exclusivos; el servidor fusiona sesiones por ID y
conserva los borrados. Conserva los JSON descargados como respaldo.

La localStorage del sitio anterior no se transfiere automaticamente al nuevo
dominio. No borres los datos del navegador antiguo antes de confirmar la copia.

## Desarrollo y pruebas

`npm test` verifica la fusion, los borrados y el rechazo de peticiones sin
clave. `npx wrangler d1 migrations apply tonificacion-consumos --local` crea
la tabla de desarrollo; `npx wrangler dev --var SHARE_KEY:clave-de-prueba`
sirve la app en `http://127.0.0.1:8787`.

`apps-script.gs` se conserva solo como referencia del backend anterior; la app
nueva ya no lo utiliza.
