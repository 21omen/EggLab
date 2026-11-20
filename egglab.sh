#!/usr/bin/env bash
# Start EggLab on Linux from this checkout.
#
#   ./egglab.sh                    start the panel (installs npm deps on first run)
#   ./egglab.sh --install-desktop  add an app-menu entry for this checkout
#
# Engine, models and OpenCode are installed from the app's setup wizard.
set -euo pipefail

ROOT="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

if [ "${1:-}" = "--install-desktop" ]; then
  apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$apps"
  cat > "$apps/egglab.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=EggLab
Comment=Local AI image generation and editing for PhotoCraft
Exec="$ROOT/egglab.sh"
Icon=$ROOT/panel/build/icon.png
Terminal=false
Categories=Graphics;
StartupWMClass=EggLab
EOF
  echo "app-menu entry written: $apps/egglab.desktop"
  exit 0
fi

cd "$ROOT/panel"
if [ ! -d node_modules/electron ]; then
  echo "installing EggLab's npm dependencies (first run) ..."
  npm install
fi
# npm 12 blocks install scripts by default, which skips the download of the
# Electron binary itself. Fetch it explicitly (only Electron's own script).
if [ ! -f node_modules/electron/path.txt ]; then
  echo "downloading the Electron runtime ..."
  node node_modules/electron/install.js
fi

flags=()
# The egg places itself with absolute screen coordinates and stays on top,
# which native Wayland windows cannot do. Run through XWayland unless
# EGGLAB_WAYLAND=1 asks for native Wayland.
if [ "${XDG_SESSION_TYPE:-}" = "wayland" ] && [ -z "${EGGLAB_WAYLAND:-}" ]; then
  flags+=(--ozone-platform=x11)
fi

exec ./node_modules/.bin/electron . "${flags[@]}" "$@"
