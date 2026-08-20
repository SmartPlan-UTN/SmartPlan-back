# Calidad

## Verificaciones mínimas

Antes de dar por terminado un cambio de código ejecutá:

```bash
pnpm lint
pnpm test
pnpm build
```

Estos mismos tres comandos son los que corre el workflow `CI`
(`.github/workflows/ci.yml`) en cada PR contra `develop` y `main`, y el check
resultante es obligatorio para poder mergear.

Para cambios que afecten la aplicación integrada, levantá PostgreSQL y ejecutá:

```bash
pnpm test:e2e
```

`test:e2e` sigue siendo condicional y no forma parte del gate automático de
CI: necesita PostgreSQL y RabbitMQ reales, y correrlo en cada PR excede el
alcance actual.

## Herramientas

| Herramienta | Uso                                                     |
| ----------- | ------------------------------------------------------- |
| ESLint 9    | Análisis estático con tipos                             |
| Prettier 3  | Formato                                                 |
| Jest 30     | Pruebas unitarias y e2e                                 |
| TypeScript  | Verificación de compilación mediante el build de NestJS |

La configuración detallada y el tratamiento de warnings están en la
[skill de calidad](../skills/04-quality/SKILL.md).

## Criterios de aceptación técnicos

- Entradas HTTP validadas con DTOs y `class-validator`.
- Datos sensibles excluidos de respuestas.
- Secretos fuera del código y de Git.
- Excepciones HTTP de NestJS para errores esperables.
- Al menos una prueba del camino feliz por CU implementado.
- Nombres del dominio en español y conforme a las convenciones del proyecto.

Para detalles de aislamiento, mocks y convenciones de suites, consultá
[Testing](testing.md) y la [skill de testing](../skills/06-testing/SKILL.md).
