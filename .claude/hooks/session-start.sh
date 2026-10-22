#!/bin/bash
# クラウドのセッション開始時に依存関係を入れる（ローカルでは何もしない）
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
cd "$CLAUDE_PROJECT_DIR"
npm ci --no-audit --no-fund || npm install --no-audit --no-fund
