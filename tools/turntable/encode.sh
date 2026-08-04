#!/usr/bin/env bash
# Encode RGBA frames into a transparent, seamlessly looping WebM.
#
#   tools/turntable/encode.sh build/matte [fps] [outbase] [width]
#   VP8=1 tools/turntable/encode.sh ...     # VP8 instead of VP9
#   PRORES=1 tools/turntable/encode.sh ...  # also emit ProRes 4444
#
# WebM carries alpha in a side stream flagged by the ALPHA_MODE tag, and
# alt-ref frames must be off or the alpha plane is dropped.
#
# Verifying the result is fiddly: ffmpeg's *native* vp8/vp9 decoders silently
# ignore WebM alpha, so a correct file decodes as fully opaque unless you force
# the libvpx wrapper with -c:v. This script self-checks that way at the end.
#
# Browser support: Chrome/Edge/Firefox composite WebM alpha. Safari does NOT --
# it needs HEVC-with-alpha in MP4, which only encodes on macOS (videotoolbox).
set -euo pipefail

DIR="${1:-build/matte}"
FPS="${2:-24}"
OUTBASE="${3:-$DIR/turntable}"
WIDTH="${4:-0}"

# Playwright's bundled ffmpeg is stripped (no PNG decoder), so find a real one.
find_ffmpeg() {
  for c in "${FFMPEG:-}" "$(command -v ffmpeg || true)" \
           "$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())' 2>/dev/null || true)"; do
    # grep must consume all input: with pipefail, `grep -q` exiting early would
    # SIGPIPE ffmpeg and fail the pipeline despite a match.
    [ -n "$c" ] && [ -x "$c" ] && "$c" -hide_banner -decoders 2>/dev/null | grep -w png >/dev/null && { echo "$c"; return; }
  done
  echo "no ffmpeg with a PNG decoder found; try: pip install imageio-ffmpeg" >&2
  exit 1
}
FF="$(find_ffmpeg)"

if [ "${VP8:-0}" = "1" ]; then CODEC=libvpx; CRF=30; else CODEC=libvpx-vp9; CRF=34; fi
CRF="${CRF_OVERRIDE:-$CRF}"
SCALE=(); [ "$WIDTH" != "0" ] && SCALE=(-vf "scale=$WIDTH:-2")

"$FF" -hide_banner -loglevel error -y \
  -framerate "$FPS" -start_number 0 -i "$DIR/frame_%04d.png" \
  -c:v "$CODEC" -pix_fmt yuva420p \
  -auto-alt-ref 0 -row-mt 1 -deadline good -cpu-used 2 \
  -metadata:s:v:0 alpha_mode="1" \
  -b:v 0 -crf "$CRF" \
  "${SCALE[@]}" "$OUTBASE.webm"

cp "$DIR/frame_0000.png" "$OUTBASE-poster.png"

# Self-check: decode a mid-clip frame through the libvpx wrapper and confirm
# the alpha channel actually survived.
CHECK="$(mktemp -d)/f.png"
"$FF" -hide_banner -loglevel error -y -ss 2 -c:v "$CODEC" -i "$OUTBASE.webm" \
  -frames:v 1 -pix_fmt rgba "$CHECK"
python3 - "$CHECK" <<'PY'
import sys
from PIL import Image
import numpy as np
a = np.asarray(Image.open(sys.argv[1]).convert("RGBA").getchannel("A"))
clear, solid = int((a == 0).sum()), int((a == 255).sum())
soft = int(((a > 0) & (a < 255)).sum())
if clear == 0:
    sys.exit("  ALPHA CHECK FAILED: no transparent pixels in the encoded file")
print(f"  alpha verified: {clear} transparent, {solid} opaque, {soft} soft-edge px")
PY

echo "wrote $OUTBASE.webm ($(du -h "$OUTBASE.webm" | cut -f1)) [$CODEC], $OUTBASE-poster.png"

# ProRes 4444 keeps a real 16-bit alpha channel for editorial / After Effects.
if [ "${PRORES:-0}" = "1" ]; then
  "$FF" -hide_banner -loglevel error -y \
    -framerate "$FPS" -start_number 0 -i "$DIR/frame_%04d.png" \
    -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -alpha_bits 16 \
    "${SCALE[@]}" "$OUTBASE.mov"
  echo "wrote $OUTBASE.mov ($(du -h "$OUTBASE.mov" | cut -f1))"
fi
