#!/usr/bin/env bash
# Regenerate supabase/schema.sql — a single, idempotent, paste-and-run file
# built from every migration in order. Run after adding a migration:
#     npm run db:schema
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="supabase/schema.sql"

{
  echo "-- ============================================================================"
  echo "-- ACREDIA — Full database schema (generated; do not edit by hand)"
  echo "--"
  echo "-- Regenerate with:  npm run db:schema"
  echo "-- Source of truth:  supabase/migrations/*.sql"
  echo "--"
  echo "-- HOW TO USE"
  echo "--   Supabase dashboard → SQL Editor → paste this whole file → Run."
  echo "--"
  echo "-- SAFE TO RE-RUN. Every statement is idempotent:"
  echo "--   • CREATE TABLE / INDEX ... IF NOT EXISTS"
  echo "--   • ADD COLUMN ... IF NOT EXISTS"
  echo "--   • CREATE OR REPLACE FUNCTION"
  echo "--   • DROP POLICY / TRIGGER IF EXISTS before each CREATE"
  echo "-- Existing objects are skipped; missing ones are created. No data is dropped."
  echo "--"
  echo "-- Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "-- ============================================================================"
  echo

  for f in supabase/migrations/*.sql; do
    echo
    echo "-- ============================================================================"
    echo "-- migration: $(basename "$f")"
    echo "-- ============================================================================"
    echo
    cat "$f"
    echo
  done
} > "$OUT"

echo "Wrote $OUT ($(wc -l < "$OUT") lines from $(ls supabase/migrations/*.sql | wc -l) migrations)"
