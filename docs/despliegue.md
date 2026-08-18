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
| Colas                | RabbitMQ            |

`main` es la rama prevista para producción y `develop` es la rama de
integración. Las ramas de trabajo se integran mediante pull request aprobado.

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
