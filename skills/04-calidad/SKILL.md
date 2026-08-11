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
pnpm lint        # análisis estático
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
| `@typescript-eslint/no-explicit-any` | `off` | Ver la advertencia de abajo |
| `@typescript-eslint/no-floating-promises` | `warn` | Promesa sin `await` ni `.catch()` |
| `@typescript-eslint/no-unsafe-argument` | `warn` | Pasar un `any` a un parámetro tipado |
| `prettier/prettier` | `error` | Con `endOfLine: "auto"` (necesario en Windows) |

## ⚠️ Dos cosas a revisar en la configuración actual

Son herencia del starter de NestJS, no decisiones deliberadas del equipo:

**1. El script `lint` incluye `--fix`.**

```json
"lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"
```

Un comando llamado `lint` que además modifica archivos hace difícil usarlo como
verificación (en CI, o antes de un commit) porque siempre "pasa" después de
arreglar. Lo habitual es separarlo:

```json
"lint": "eslint \"{src,apps,libs,test}/**/*.ts\"",
"lint:fix": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"
```

**2. `no-explicit-any` está desactivado acá, pero en el front está en `error`.**

Los dos repositorios tienen criterios distintos para la misma regla. Conviene
unificar el criterio antes de que haya código real, no después.

Cualquiera de los dos cambios necesita acuerdo del equipo. Están anotados en
`SEGUIMIENTO.md` como pendientes.

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
