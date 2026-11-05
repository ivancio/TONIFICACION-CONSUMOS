# TONIFICACION-CONSUMOS

App para registrar sesiones de los dos decoradores. La web y la API se publican
en un mismo Cloudflare Worker; D1 conserva una copia compartida. Cada navegador
mantiene tambien sus datos locales y confirma una subida solo tras releer D1.

## Primera puesta en marcha

1. `npm install`
2. `npx wrangler d1 migrations apply tonificacion-consumos --remote`
3. `npm run deploy`
4. En Cloudflare, activa Zero Trust Free. En Workers & Pages >
   `tonificacion-consumos` > Access, selecciona "Protect this Worker behind
   Access", "All traffic" y permite solo tu correo. Sin Access, el Worker
   responde 403 para la web y la API.

El Worker usa `ctx.access` en desarrollo y valida el JWT de Access en
produccion: el router de Static Assets no transmite `ctx.access` al Worker.
`TEAM_DOMAIN` y `POLICY_AUD` estan en `wrangler.jsonc`; si se recrea la
aplicacion de Access, hay que actualizar el AUD y volver a desplegar.

El Worker esta en `https://tonificacion-consumos.espinosa-surface.workers.dev/`.

## Pasar datos del sitio anterior

En el movil que contiene los datos antiguos, descarga "Copia de seguridad"
desde la pantalla inicial. Abre la nueva URL, inicia sesion con Access y usa
"Restaurar copia" para importar el JSON. Comprueba "Confirmado en la nube"
antes de usar otro movil. Repite la importacion con cualquier otro movil que
tenga registros locales exclusivos; el servidor fusiona sesiones por ID y
conserva los borrados. Conserva los JSON descargados como respaldo.

La localStorage del sitio anterior no se transfiere automaticamente al nuevo
dominio. No borres los datos del navegador antiguo antes de confirmar la copia.

## Desarrollo y pruebas

`npm test` verifica la fusion, los borrados y el rechazo de peticiones sin
Access. `npx wrangler d1 migrations apply tonificacion-consumos --local` crea
la tabla de desarrollo; `npm run dev` sirve la app en `http://127.0.0.1:8787`.
La identidad Access local se simula mediante `access.dev` en `wrangler.jsonc`.

`apps-script.gs` se conserva solo como referencia del backend anterior; la app
nueva ya no lo utiliza.
