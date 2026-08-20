# Despliegue

## Estado

No hay un pipeline de CI/CD ni infraestructura de producción verificada en este
repositorio. TypeORM sí está preparado para ejecutar migraciones al arrancar en
`production`; el resto describe el objetivo previsto.

## Objetivo de despliegue

| Componente           | Plataforma prevista |
| -------------------- | ------------------- |
| Frontend             | Vercel              |
| Backend y PostgreSQL | Railway             |
| Imágenes             | Amazon S3           |
| Colas                | Railway (servicio propio con volumen, red privada) |

`main` es la rama prevista para producción y `develop` es la rama de
integración. Las ramas de trabajo se integran mediante pull request aprobado.

## Railway: API, worker y RabbitMQ

Documentación de la configuración necesaria (F12, #34) — no automatizada
todavía, no hay infraestructura como código en el repositorio.

**Tres servicios** en el mismo proyecto Railway, dos desde el mismo repo:

| Servicio | Origen | Start command |
|---|---|---|
| `smartplan-api` | repo `SmartPlan-back` | `pnpm start:prod` |
| `smartplan-worker` | repo `SmartPlan-back` (mismo) | `pnpm start:worker:prod` |
| `rabbitmq` | imagen `rabbitmq:4.1-management-alpine` | — |

- **Volumen de Railway** montado en `/var/lib/rabbitmq` en el servicio de
  RabbitMQ. Sin volumen, un redeploy pierde las colas durables y la DLQ, que
  es el registro operativo de trabajos que no se pudieron procesar.
- **Red privada solamente.** `RABBITMQ_URL` usa el hostname interno de
  Railway (`rabbitmq.railway.internal`). No exponer el puerto 5672
  públicamente. El puerto 15672 (panel) tampoco — acceso vía
  `railway connect` o un túnel si hace falta administrarlo desde afuera.
- **Variables — no compartidas 1:1 entre API y worker.** Los dos servicios
  definen `RABBITMQ_URL` (y `RABBITMQ_PREFETCH`/`RABBITMQ_MAX_INTENTOS`/
  `RABBITMQ_RETRY_DELAYS_MS` si difieren del default). `smartplan-api`
  además necesita `DATABASE_URL`, los dos secretos JWT, Resend y las API keys, porque valida
  el esquema completo de entorno. `smartplan-worker`, en este ticket, no
  necesita ninguna de esas tres — valida un subconjunto que hoy solo pide las
  variables de RabbitMQ. Esto va a cambiar cuando un ticket futuro le agregue
  al worker acceso a Postgres/Google Maps/Gemini.
- **Escalado**: el worker escala horizontalmente sin coordinación —
  RabbitMQ reparte el trabajo entre instancias (competing consumers).
  `RABBITMQ_PREFETCH` controla cuánto toma cada instancia a la vez.
- **Orden de arranque**: la API y el worker esperan una conexión sana a
  RabbitMQ antes de terminar de arrancar (`connectionInitOptions.wait:
  true`) — es esperable que el primer deploy reintente si RabbitMQ todavía
  no está listo; Railway reinicia el servicio automáticamente.
- **Costo**: el cuadro de la Etapa 3 presupuesta Railway como "Backend +
  PostgreSQL" (US$ 240/año). Sumar el servicio de worker y el de RabbitMQ
  (con volumen) va a mover ese número — queda pendiente de revisar, no se
  estima acá sin datos reales de uso.

## Requisitos antes de publicar

1. Ejecutar lint, pruebas y build sin errores.
2. Configurar secretos exclusivamente en la plataforma de despliegue.
3. Usar migraciones de TypeORM en producción; no habilitar `synchronize`.
4. Configurar CORS, URL pública, logs y monitoreo cuando se defina el entorno.
5. Documentar el procedimiento efectivo una vez que exista infraestructura.

## Variables y secretos

Las variables de producción deben respetar el esquema de
`VariablesEntorno`. Nunca se copian secretos a archivos versionados, issues,
pull requests, logs o documentación.
