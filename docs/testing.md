# Testing

## Tipos de prueba

| Tipo     | Ubicación                    | Comando         | Dependencias                   |
| -------- | ---------------------------- | --------------- | ------------------------------ |
| Unitario | Junto al código, `*.spec.ts` | `pnpm test`     | Mockeadas, sin base de datos   |
| E2E      | `test/*.e2e-spec.ts`         | `pnpm test:e2e` | Aplicación y PostgreSQL reales |

## Base aislada

Los e2e usan una base distinta a desarrollo, por defecto `smartplan_test`. El
setup la crea si no existe y vacía su esquema al iniciar. El nombre debe terminar
en `_test`: es una barrera de seguridad para impedir que el `DROP SCHEMA` de la
preparación de pruebas se ejecute accidentalmente sobre la base de desarrollo o
producción.

Antes de ejecutar e2e:

```bash
pnpm db:up
pnpm test:e2e
```

Las suites e2e se ejecutan de a una porque comparten la misma base. Si una suite
necesita aislamiento adicional, debe limpiar sus propias tablas en `beforeEach`.

## Expectativas por caso de uso

- Unitario del servicio: camino feliz y error relevante.
- E2E del endpoint: código HTTP y forma de respuesta.
- E2E de DTO inválido: respuesta `400` cuando aplique.
- Nombre del test orientado al comportamiento e incluyendo el CU.

Los moldes existentes y la forma de mockear repositorios TypeORM están en la
[skill de testing](../skills/06-testing/SKILL.md).
