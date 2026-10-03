#!/usr/bin/env bash
set -euo pipefail

# Build the backend-less demo at /demo/ FROM THE CURRENT WORKING TREE (always matches `main`),
# using the VITE_DEMO flag to swap Supabase for an in-browser, localStorage-backed demo store
# (src/demo/store.ts). See src/data/session.tsx and src/data/queries.ts for the demo branches.

cd "$(dirname "$0")/.."

DIST_PATH="dist/demo"
rm -rf "$DIST_PATH"

# vite.config.ts restricts the build to the app/index.html entry when VITE_DEMO=true, so the
# output lands at "$DIST_PATH/app/index.html" (preserving the entry's path under the project root).
VITE_DEMO=true pnpm exec vite build --base /demo/ --outDir "$DIST_PATH" --emptyOutDir

mv "$DIST_PATH/app/index.html" "$DIST_PATH/index.html"
rmdir "$DIST_PATH/app"

# Inject a visible banner into the built demo HTML
if [ -f "$DIST_PATH/index.html" ]; then
  # Use sed to insert the banner after <body>
  # Match <body> and insert the banner on the next line (portable across macOS and Linux)
  sed -i.bak '/<body>/a\
    <div style="background: #fff3cd; border-bottom: 2px solid #ffc107; padding: 12px 16px; font-size: 14px; font-family: system-ui, -apple-system, sans-serif; text-align: center; color: #333;">Demo — data stays in your browser. <a href="/app/" style="color: #0066cc; text-decoration: none; font-weight: 500;">Sign in</a></div>' \
    "$DIST_PATH/index.html"
  # Remove the backup file created by sed
  rm -f "$DIST_PATH/index.html.bak"
else
  echo "Error: $DIST_PATH/index.html not found after build" >&2
  exit 1
fi

echo "✓ Demo built successfully at $DIST_PATH/index.html"
