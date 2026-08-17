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
| RabbitMQ y S3                           | Previsto | Requieren validación e implementación antes de considerarse parte del sistema activo. |
| Gemini como motor de generación de planes | Vigente | Reemplaza a la API de OpenAI prevista en la factibilidad técnica original (Etapa 3). Validado por el spike F10 (#32): plan estructurado en español, presupuesto respetado, lugares reales verificables vía Grounding with Google Maps, costo por generación dentro de los US$120/año presupuestados. La integración productiva de CU17/CU19/CU31 (con RabbitMQ y Workers) queda pendiente de implementación. |

## Registro de una decisión nueva

Documentá una decisión cuando afecte la arquitectura, el modelo de datos, un
contrato HTTP, seguridad, infraestructura o una convención compartida. Debe
incluir el contexto, la alternativa elegida y su motivo. Si es temporal u
operativa, alcanza con registrarla en `SEGUIMIENTO.md`.
