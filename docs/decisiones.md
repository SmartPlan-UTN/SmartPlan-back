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
| RabbitMQ, S3 y OpenAI                   | Previsto | Requieren validación e implementación antes de considerarse parte del sistema activo. |

## Registro de una decisión nueva

Documentá una decisión cuando afecte la arquitectura, el modelo de datos, un
contrato HTTP, seguridad, infraestructura o una convención compartida. Debe
incluir el contexto, la alternativa elegida y su motivo. Si es temporal u
operativa, alcanza con registrarla en `SEGUIMIENTO.md`.
