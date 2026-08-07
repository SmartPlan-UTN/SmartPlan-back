---
name: smartplan-git-flow
description: Reglas de ramas, protección, pull requests y mensajes de commit. Consultar antes de cualquier operación de git.
---

# SmartPlan — Flujo de trabajo con Git

> Núcleo compartido. Este archivo es idéntico en `SmartPlan-front` y `SmartPlan-back`.
> Si lo modificás, replicá el cambio en el otro repositorio.

## Regla número uno

**Nunca commitear parado en `main` ni en `develop`.** Ambas están protegidas en
GitHub y el push va a ser rechazado con `GH006: Protected branch update failed`.

Si ya commiteaste en la rama equivocada, no hace falta perder el trabajo:

```bash
git switch -c <nombre-de-rama>      # el commit se lleva a la rama nueva
git branch -f main origin/main      # main vuelve a donde está el remoto
```

## Estructura de ramas

```
main        producción. Protegida. Solo recibe merges desde develop.
develop     integración. Protegida. Base de todas las ramas de trabajo.
<rama>      trabajo del día a día. Sale de develop y vuelve a develop por PR.
```

## Protección de ramas (configurada en GitHub)

Aplica a `main` y a `develop`:

- Require a pull request before merging
- Require approvals — **2 aprobaciones**
- Dismiss stale pull request approvals when new commits are pushed
- Do not allow bypassing the above settings

O sea: no hay atajos, ni siquiera para los administradores. Todo entra por PR con
dos revisiones.

## Nombres de rama

La convención del equipo usa el identificador del ticket de Jira:

```
SMART-<número>-<descripción-corta-en-kebab-case>
```

Ejemplo real del repositorio: `SMART-5-mecanismo-de-seguimiento-indicadores-reuniones`

Si la tarea no tiene ticket, usá un prefijo descriptivo:

```
feature/<descripción>     funcionalidad nueva
fix/<descripción>         corrección de bug
docs/<descripción>        documentación
chore/<descripción>       configuración, dependencias, tooling
```

## Ciclo de trabajo

```bash
git switch develop
git pull
git switch -c SMART-XX-descripcion

# ... trabajar, commitear ...

pnpm lint                 # el PR no debería llevar errores de lint
git push -u origin SMART-XX-descripcion
```

Después abrir el PR **con base `develop`** (no `main`) desde GitHub.

## Mensajes de commit

En español, en imperativo, y **referenciando el caso de uso cuando aplique**.
La trazabilidad CU → código es un requisito de la documentación del proyecto.

```
Implementar generación de plan automático (CU17)

Agrega el endpoint POST /api/planes/generar y el servicio que combina
actividades según presupuesto y tiempo disponible.
```

Para trabajo sin CU asociado (configuración, tooling, documentación), alcanza con
una línea descriptiva:

```
Configurar analizador de código estático con ESLint
```

## Descripción del PR

Un PR debería responder tres cosas:

1. **Qué hace** — y qué CU / US cubre.
2. **Cómo probarlo** — comandos concretos.
3. **Qué queda afuera** — si algo del alcance no entró, decirlo.

## Qué no hacer

- No commitear en `main` ni en `develop`.
- No hacer `git push --force` sobre ramas compartidas.
- No mergear tu propio PR sin las 2 aprobaciones.
- No commitear `.env`, credenciales ni claves de API.
- No commitear `node_modules/` ni `.next/`.
