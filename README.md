# TONIFICACION-CONSUMOS

## Sincronizacion entre moviles

La app guarda cada sesion en el movil con un identificador propio. El Apps Script
fusiona sesiones por identificador y conserva los borrados. La app solo muestra
"Confirmado en la nube" despues de volver a leer los registros del servidor.

Para activar esta version en una instalacion existente: abre el proyecto de
Google Apps Script, sustituye su codigo por `apps-script.gs` y publica una
**nueva version de la implementacion web actual**. Conserva la misma URL `/exec`.
Hasta hacerlo, la app muestra "Actualiza el Apps Script" y mantiene los cambios
en el dispositivo. Exporta una copia JSON antes de actualizar la implementacion.

Prueba local: `node sync.test.cjs`.
