#!/usr/bin/env bash
#
# Publish dist/ to the gh-pages branch, which GitHub Pages serves.
#
# Deliberately not a GitHub Actions workflow: adding .github/workflows/ needs a
# token with the `workflow` scope. If you'd rather have pushes deploy
# automatically, add such a workflow yourself and delete this script.
#
# Usage:  npm run deploy
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d dist ]; then
  echo "dist/ not found - run 'npm run build' first" >&2
  exit 1
fi

REMOTE=$(git config --get remote.origin.url)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

cp -R dist/* "$STAGE"/
# Stop GitHub's Jekyll pass from touching the build.
touch "$STAGE/.nojekyll"

cd "$STAGE"
git init -q
git add -A
git commit -q -m "Deploy Mirror to GitHub Pages"
git push -q --force "$REMOTE" HEAD:gh-pages

echo "deployed to gh-pages"
echo "note: Pages can take a minute, and browsers cache the old bundle -"
echo "      hard-reload (cmd+shift+R) if you still see the previous version."
