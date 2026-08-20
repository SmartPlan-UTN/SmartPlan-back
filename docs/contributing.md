# Contribución

## Flujo de ramas

```text
main <- develop <- rama de trabajo
```

`main` y `develop` están protegidas. No se hacen commits directos ni merges sin
pull request y dos aprobaciones.

Las ramas con ticket usan:

```text
SMART-<id-del-ticket>-<descripcion-en-kebab-case>
```

Para trabajo sin ticket: `feature/`, `fix/`, `docs/` o `chore/`.

## Ciclo de trabajo

1. Partí de `develop` en una rama nueva.
2. Leé las skills aplicables antes de editar.
3. Implementá el cambio con pruebas y documentación necesaria.
4. Ejecutá las verificaciones de calidad.
5. Abrí un PR hacia `develop` con `Closes #NN` cuando exista issue.
6. Actualizá `TRACKING.md` si el cambio deja una decisión, bloqueo o hito operativo.

## Commits y pull requests

Los commits se escriben en español, en imperativo y mencionan el CU cuando
aplica. Ejemplo:

```text
Implementar generación de plan automático (CU17)
```

El PR debe indicar qué hace, cómo probarlo, qué CU/US cubre y qué quedó fuera de
alcance. No incluir secretos, archivos `.env`, artefactos generados ni cambios
ajenos a la tarea.

La guía completa está en la [skill de Git](../skills/02-git-flow/SKILL.md).
