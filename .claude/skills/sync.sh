#!/usr/bin/env bash
# Sincroniza .claude/skills/*/SKILL.md desde la fuente real en skills/*/SKILL.md
# Correr después de editar cualquier archivo en skills/. Ver skills/README.md.
set -e
cd "$(dirname "$0")/../.."
declare -A MAP=(
  [00-proyecto]=smartplan-proyecto
  [01-dominio]=smartplan-dominio
  [02-git-flow]=smartplan-git-flow
  [03-backend]=smartplan-backend
  [04-calidad]=smartplan-calidad
  [05-arquitectura]=smartplan-arquitectura
  [06-testing]=smartplan-testing
)
for d in "${!MAP[@]}"; do
  name="${MAP[$d]}"
  mkdir -p ".claude/skills/$name"
  cp "skills/$d/SKILL.md" ".claude/skills/$name/SKILL.md"
  # copia también archivos de referencia adicionales (divulgación progresiva)
  for extra in "skills/$d/"*.md; do
    base="$(basename "$extra")"
    [ "$base" = "SKILL.md" ] && continue
    cp "$extra" ".claude/skills/$name/$base"
  done
  echo "sincronizado: skills/$d -> .claude/skills/$name"
done
