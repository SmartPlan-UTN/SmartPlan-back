# Decisiones técnicas

Este documento conserva decisiones estables. Las decisiones operativas recientes
también se anotan de forma breve en `SEGUIMIENTO.md`.

| Decisión                                | Estado   | Fundamento                                                                            |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| PostgreSQL con TypeORM                  | Vigente  | Persistencia relacional con Docker local y soporte de migraciones.                    |
| JWT gestionado por el backend           | Vigente  | Definido en la factibilidad técnica.                                                  |
| Dominio en español                      | Vigente  | Mantiene trazabilidad con el documento académico.                                     |
| `class-validator` para entorno y DTOs   | Vigente  | Evita sumar dos librerías de validación.                                              |
| Validación de entorno al arranque       | Vigente  | Falla temprano ante configuración incompleta.                                         |
| GitHub Issues para backlog y sprints    | Vigente  | Reemplaza el uso anterior de Jira.                                                    |
| URL o variables sueltas para PostgreSQL | Vigente  | Railway entrega `DATABASE_URL`; Docker local comparte las variables `DB_*`.           |
| Base e2e aislada con sufijo `_test`     | Vigente  | Evita ejecutar limpieza de esquema contra desarrollo.                                 |
| Migraciones al arranque en producción   | Vigente  | No hay un paso de despliegue separado previsto.                                       |
| Google Maps: Places API (New) + Routes API (Compute Route Matrix) + Geocoding API, sin Distance Matrix (Legacy) | Vigente | Spike F11 (#33) validado con corrida real. Distance Matrix está en estado Legacy en la documentación oficial de Google, que recomienda explícitamente Compute Route Matrix; no hay razón técnica encontrada para preferir la legacy. Detalle completo, pricing y política de caching en `SEGUIMIENTO.md`. |
| S3                                      | Previsto | Requiere validación e implementación antes de considerarse parte del sistema activo. |
| Semilla en script propio, no en migración | Vigente | Una migración se ejecuta una sola vez y queda anotada en la tabla `migrations`: agregar un permiso obligaría a escribir otra migración. Un script idempotente (`pnpm db:seed`) se puede volver a correr después de cada incorporación. |
| La semilla no pisa ni revive filas existentes | Vigente | `nombre` y `descripcion` de los catálogos se editan desde la administración (CU54, CU61, CU62), y una baja lógica es una decisión deliberada. Sobrescribir o reponer haría que cada despliegue deshiciera trabajo del administrador. La existencia se chequea incluyendo `deleted_at`, que además evita duplicados: los índices únicos del modelo son parciales. |
| El rol administrador recibe todos los permisos | Vigente | El administrador también usa la aplicación —genera planes, guarda favoritos, valora—, y un perfil limitado a la administración obligaría a mantener dos cuentas por persona. |
| Gemini como motor de generación de planes | Vigente | Reemplaza a la API de OpenAI prevista en la factibilidad técnica original (Etapa 3). Validado por el spike F10 (#32): plan estructurado en español, presupuesto respetado, lugares reales verificables vía Grounding with Google Maps, costo por generación dentro de los US$120/año presupuestados. La integración productiva de CU17/CU19/CU31 (con la infraestructura de colas de F12) queda pendiente de implementación. |
| RabbitMQ con `@golevelup/nestjs-rabbitmq`, worker como proceso aparte | Vigente | F12 (#34): infraestructura de colas y worker base implementada — exchange direct `smartplan.jobs`, reintentos vía TTL + Dead Letter Exchange (hasta 3 intentos), DLQ, semántica at-least-once. Publisher (`MensajeriaService`) que abstrae AMQP del negocio. Job de ejemplo verificado contra RabbitMQ real. Sin trabajos funcionales todavía (generación de planes, notificaciones) — la infraestructura queda lista para que los sprints siguientes los implementen. Detalle completo en `SEGUIMIENTO.md` y `docs/arquitectura.md`. |

## Registro de una decisión nueva

Documentá una decisión cuando afecte la arquitectura, el modelo de datos, un
contrato HTTP, seguridad, infraestructura o una convención compartida. Debe
incluir el contexto, la alternativa elegida y su motivo. Si es temporal u
operativa, alcanza con registrarla en `SEGUIMIENTO.md`.
