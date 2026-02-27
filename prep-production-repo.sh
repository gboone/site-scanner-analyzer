#!/bin/bash
set -euo pipefail

# Set DEPLOY_DIR in your shell profile (~/.zshrc or ~/.bash_profile):
#   export DEPLOY_DIR=~/src/gboone-site-scan-analyzer
: "${DEPLOY_DIR:?DEPLOY_DIR is not set. Add 'export DEPLOY_DIR=/path/to/deploy/repo' to your shell profile.}"

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

rsync -av \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='*/node_modules' \
  --exclude='dist' \
  --exclude='*/dist' \
  --exclude='.env' \
  --exclude='*.db' \
  --exclude='*.db-journal' \
  --exclude='drizzle/' \
  "$SOURCE_DIR/" \
  "$DEPLOY_DIR/"

rm -rf "$DEPLOY_DIR/src"
rm -rf "$DEPLOY_DIR/examples"
