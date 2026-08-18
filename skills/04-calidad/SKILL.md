---
name: smartplan-calidad
description: Análisis estático con ESLint y Prettier en el backend — qué está configurado, cómo correrlo y qué hacer ante un error.
---

# SmartPlan Back — Calidad y análisis estático

## Herramientas

**ESLint 9** en *flat config* (`eslint.config.mjs`), con **typescript-eslint** y
**Prettier** integrado como regla de ESLint (`eslint-plugin-prettier`).

## Comandos

```bash
pnpm lint        # análisis estático (solo verificación, no modifica archivos)
pnpm lint:fix    # análisis estático + corrección automática
pnpm format      # formateo con Prettier
pnpm test        # tests unitarios
```

**Corré `pnpm lint` y `pnpm test` antes de abrir un PR.**

## Qué hay configurado

El archivo `eslint.config.mjs` parte de:

- `@eslint/js` → `recommended`
- `typescript-eslint` → **`recommendedTypeChecked`** (análisis con información de
  tipos: ESLint consulta al compilador de TypeScript)
- `eslint-plugin-prettier/recommended` (el formato se valida como regla de lint)

Con globals de Node y Jest, `projectService: true`, y estos ajustes propios:

| Regla | Severidad | Nota |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | `error` | Mismo criterio que `SmartPlan-front` |
| `@typescript-eslint/no-floating-promises` | `warn` | Promesa sin `await` ni `.catch()` |
| `@typescript-eslint/no-unsafe-argument` | `warn` | Pasar un `any` a un parámetro tipado |
| `prettier/prettier` | `error` | Con `endOfLine: "auto"` (necesario en Windows) |

## Nota sobre `lint` vs. `lint:fix` y `no-explicit-any` (resuelto en #27)

El script `lint` original venía del starter de NestJS con `--fix` incluido, lo
que lo hacía inservible como verificación (siempre "pasaba" después de
arreglar en silencio). Se separó en `lint` (solo verificación, sin modificar
archivos) y `lint:fix` (corrección automática). De paso se unificó
`no-explicit-any` con el criterio real de `SmartPlan-front` (`error`), que
antes estaba en `off` acá.

## Qué hacer ante un error de lint

En orden de preferencia:

1. **Arreglar el código.**
2. Si la variable no se usa a propósito, prefijala con `_`.
3. Si de verdad hay que ignorar una línea, usá un disable **con motivo escrito**:
   ```ts
   // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- la librería X no tipa el callback
   ```

**No desactives una regla en `eslint.config.mjs` para que deje de molestar.** Si
una regla genera ruido sistemático, discutilo en el PR y documentá el motivo.

## Convenciones que ESLint no chequea

- Nombres del dominio en español (ver `skills/01-dominio/`).
- DTOs con `class-validator` para toda entrada de la API.
- Sin credenciales ni secretos en el código: variables de entorno.
- Sin devolver entidades con campos sensibles (contraseñas, tokens).
- Un CU no se da por terminado sin al menos un test del camino feliz.
