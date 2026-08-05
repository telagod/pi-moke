#!/usr/bin/env bash
# 由 sources/prompts/*.md 模块合成 AGENTS.md(按模块标记顺序)
set -euo pipefail
cd "$(dirname "$0")/.."
out=AGENTS.md
first=1
{
  echo "# CTF Lab 2.0 —— 墨客版（MoKe）"
  echo
  echo "Generated from modular prompt files under prompts/."
  echo
  for f in sources/prompts/*.md; do
    [ "$(basename "$f")" = README.md ] && continue
    [ $first -eq 0 ] && echo
    first=0
    echo "<!-- module: $(basename "$f") -->"
    cat "$f"
  done
} > "$out"
echo "AGENTS.md regenerated ($(wc -l < "$out") lines)"
