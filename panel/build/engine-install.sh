#!/usr/bin/env bash
# EggLab engine installer for Linux (counterpart of engine-install.ps1).
#
# stable-diffusion.cpp publishes no Linux CUDA build, so the engine is built
# from source at the same pinned release the Windows downloader uses. The
# variant follows the machine:
#
#   cuda    NVIDIA + CUDA toolkit (nvcc)        - fastest, what EggLab targets
#   vulkan  any GPU with Vulkan dev files (glslc) - no toolkit needed
#   cpu     everything else                      - slow
#
# Like the Windows script it falls back down that ladder when a build fails,
# and EggLab keeps working for everything else if all of them fail.
#
# Usage:
#   engine-install.sh [--variant auto|cuda|vulkan|cpu] [--engine-dir DIR] [--force] [--keep-source]
#
# Needs: git, cmake, a C++ compiler; for cuda the CUDA toolkit, for vulkan
# the Vulkan headers/loader and glslc (shaderc).
set -uo pipefail

RELEASE='master-1091-b9d7176'
COMMIT='b9d7176bf88fe465576e0aafbe47ba253ffcfc2c'
REPO='https://github.com/leejet/stable-diffusion.cpp.git'

VARIANT='auto'
ENGINE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/egglab/engine"
FORCE=0
KEEP_SOURCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --variant) VARIANT="${2:-auto}"; shift 2 ;;
    --engine-dir) ENGINE_DIR="${2:?}"; shift 2 ;;
    --force) FORCE=1; shift ;;
    --keep-source) KEEP_SOURCE=1; shift ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "unknown option: $1"; exit 2 ;;
  esac
done

case "$VARIANT" in auto|cuda|vulkan|cpu) ;; *) echo "invalid variant: $VARIANT"; exit 2 ;; esac
[ -n "${EGGLAB_ENGINE_VARIANT:-}" ] && [ "$VARIANT" = auto ] && VARIANT="$EGGLAB_ENGINE_VARIANT"

TARGET="$ENGINE_DIR/sd"
EXE="$TARGET/sd-cli"
SRC="$ENGINE_DIR/src"

if [ "$FORCE" -eq 0 ] && [ -x "$EXE" ]; then
  echo "engine already present: $EXE"
  exit 0
fi

for tool in git cmake; do
  command -v "$tool" >/dev/null 2>&1 || { echo "engine install failed: '$tool' is not installed"; exit 1; }
done
if ! command -v c++ >/dev/null 2>&1 && ! command -v g++ >/dev/null 2>&1 && ! command -v clang++ >/dev/null 2>&1; then
  echo "engine install failed: no C++ compiler found (install gcc or clang)"
  exit 1
fi

find_nvcc() {
  if [ -n "${CUDACXX:-}" ] && [ -x "$CUDACXX" ]; then echo "$CUDACXX"; return 0; fi
  if command -v nvcc >/dev/null 2>&1; then command -v nvcc; return 0; fi
  for f in /opt/cuda/bin/nvcc /usr/local/cuda/bin/nvcc; do
    [ -x "$f" ] && { echo "$f"; return 0; }
  done
  return 1
}

has_nvidia() {
  command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1
}

has_vulkan_dev() {
  command -v glslc >/dev/null 2>&1 || return 1
  [ -f /usr/include/vulkan/vulkan.h ] || [ -n "${VULKAN_SDK:-}" ]
}

resolve_variant() {
  if [ "$VARIANT" != auto ]; then echo "$VARIANT"; return; fi
  if has_nvidia; then
    if find_nvcc >/dev/null; then echo cuda; return; fi
    echo "note: NVIDIA GPU found but no CUDA toolkit (nvcc) - install it for the fastest engine (Arch: pacman -S cuda)" >&2
  fi
  if has_vulkan_dev; then echo vulkan; return; fi
  echo cpu
}

fetch_source() {
  if [ -d "$SRC/.git" ] && [ "$(git -C "$SRC" rev-parse HEAD 2>/dev/null)" = "$COMMIT" ]; then
    echo "source already at $RELEASE"
  else
    rm -rf "$SRC"
    mkdir -p "$ENGINE_DIR"
    echo "downloading stable-diffusion.cpp $RELEASE ..."
    git clone --progress --depth 1 --branch "$RELEASE" "$REPO" "$SRC" || return 1
  fi
  echo "downloading submodules ..."
  git -C "$SRC" submodule update --init --recursive --depth 1 --progress || return 1
  [ "$(git -C "$SRC" rev-parse HEAD)" = "$COMMIT" ] || { echo "source is not at the pinned commit"; return 1; }
}

build_variant() {
  local v="$1"
  local build="$SRC/build-$v"
  local flags=(
    -DCMAKE_BUILD_TYPE=Release
    -DSD_BUILD_SHARED_LIBS=OFF
    -DBUILD_SHARED_LIBS=OFF
    -DGGML_NATIVE=ON
  )
  case "$v" in
    cuda)
      local nvcc
      nvcc="$(find_nvcc)" || { echo "nvcc not found"; return 1; }
      flags+=(-DSD_CUDA=ON "-DCMAKE_CUDA_COMPILER=$nvcc")
      # Build only for the GPU in this machine (a fraction of the compile time).
      local arch=''
      if has_nvidia; then
        arch="$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader 2>/dev/null | head -1 | tr -d ' .')"
      fi
      flags+=("-DCMAKE_CUDA_ARCHITECTURES=${arch:-native}")
      # CUDA lags behind the newest GCC. Use the host compiler the toolkit
      # names, else a versioned g++ when the default is too new.
      local ccbin="${NVCC_CCBIN:-}"
      if [ -z "$ccbin" ]; then
        for c in g++-14 g++-13 g++-12; do
          if command -v "$c" >/dev/null 2>&1; then ccbin="$(command -v "$c")"; break; fi
        done
      fi
      [ -n "$ccbin" ] && flags+=("-DCMAKE_CUDA_HOST_COMPILER=$ccbin")
      ;;
    vulkan) flags+=(-DSD_VULKAN=ON) ;;
    cpu) ;;
  esac
  echo "configuring ($v) ..."
  cmake -S "$SRC" -B "$build" "${flags[@]}" || return 1
  echo "compiling ($v) - this takes a while, progress below ..."
  cmake --build "$build" --config Release --target sd-cli -j "$(nproc)" || return 1
  local bin
  bin="$(find "$build" -type f -name sd-cli -perm -u+x | head -1)"
  [ -n "$bin" ] || { echo "sd-cli was not produced"; return 1; }

  rm -rf "$TARGET.new"
  mkdir -p "$TARGET.new"
  cp "$bin" "$TARGET.new/sd-cli"
  # Shared libraries next to the binary, if the build produced any.
  find "$(dirname "$bin")" -maxdepth 1 -name '*.so*' -exec cp -a {} "$TARGET.new/" \; 2>/dev/null
  cat > "$TARGET.new/engine-info.json" <<EOF
{
  "release": "$RELEASE",
  "commit": "$COMMIT",
  "variant": "$v",
  "built": true,
  "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  "$TARGET.new/sd-cli" --help >/dev/null 2>&1 || { echo "the built sd-cli does not start"; return 1; }
  rm -rf "$TARGET"
  mv "$TARGET.new" "$TARGET"
  echo "engine ready: $EXE ($v)"
}

V="$(resolve_variant)"
echo "engine variant: $V"

fetch_source || { echo "engine install failed: could not download the source"; exit 1; }

LADDER=("$V")
for f in vulkan cpu; do
  [ "$f" = "$V" ] && continue
  if [ "$f" = vulkan ] && ! has_vulkan_dev; then continue; fi
  LADDER+=("$f")
done

ok=1
for try in "${LADDER[@]}"; do
  [ "$try" != "$V" ] && echo "falling back from $V to $try"
  if build_variant "$try"; then ok=0; break; fi
  echo "build failed for $try"
done

if [ "$ok" -eq 0 ] && [ "$KEEP_SOURCE" -eq 0 ]; then
  echo "removing build files ..."
  rm -rf "$SRC"
fi
[ "$ok" -eq 0 ] || echo "engine install failed: no variant could be built"
exit "$ok"
