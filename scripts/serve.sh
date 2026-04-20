#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 -m http.server 8765 --directory "$HERE"
