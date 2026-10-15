#!/usr/bin/env bash
# Rebuilds the Mendoza v1 package from versioned inputs, applies the reviewed
# Google decisions and (optionally) imports into the LOCAL approved database.
#
#   bash catalog-data/mendoza-v1/run.sh build            # CSV -> package.json
#   bash catalog-data/mendoza-v1/run.sh match [--limit N] # paid: Google match of
#                                                          # places still missing an ID
#   bash catalog-data/mendoza-v1/run.sh reconcile        # apply matches, harvest IDs, rebuild
#   bash catalog-data/mendoza-v1/run.sh import           # import into smartplan_mendoza
#
# Database settings come from the environment; the CLI refuses to write to
# anything but the approved local database (or an explicit --environment).
set -euo pipefail
cd "$(dirname "$0")/../.."
D=catalog-data/mendoza-v1
mkdir -p $D/.local

build() {
  (cd $D && node build.cjs)
  pnpm -s catalog csv-to-package $D/data/places.csv $D/data/activities.csv $D/data/package.json --source mendoza-v1
}
case "${1:-}" in
  build) build ;;
  match)
    shift
    pnpm -s catalog google-match $D/data/package.json --out $D/.local/matches.json "$@" ;;
  reconcile)
    pnpm -s catalog apply-matches $D/data/package.json $D/.local/matches.json $D/.local/applied.json --drop-unmatched --drop-ambiguous
    (cd $D && node harvest.cjs data/package.json .local/applied.json .local/matches.json)
    build ;;
  import)
    pnpm -s catalog import $D/data/package.json --confirm "${CATALOG_LOCAL_DATABASE:-smartplan_mendoza}" --archive-missing
    [ -f $D/.local/matches.json ] && pnpm -s catalog google-cache-seed $D/.local/matches.json
    pnpm -s catalog eligibility ;;
  *) echo "usage: run.sh build|match|reconcile|import"; exit 1 ;;
esac
