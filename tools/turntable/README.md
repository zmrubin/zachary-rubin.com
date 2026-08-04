# Transparent turntable assets

Pulls a transparent matte from a locked-off product turntable video and encodes
it as an alpha WebM for the site.

```bash
pip install rembg onnxruntime opencv-python-headless imageio-ffmpeg

python3 tools/turntable/matte.py --in shot.mp4 --out build/matte
CRF_OVERRIDE=40 tools/turntable/encode.sh build/matte 24 public/media/turntable/name 960
```

## Why it isn't just background removal

Segmentation gives a mask, but the partially-transparent edge pixels are a
*mix* of subject and backdrop. Composite those over a dark page and the studio
grey shows up as a rim.

Because the camera is locked off, `matte.py` recovers the backdrop per-pixel by
averaging each pixel across the frames where it is background (typically ~97%
are directly observed; the rest are inpainted from the surrounding gradient).
Knowing the true backdrop `B`, the subject's own colour comes back out of the
blend with `F = (I - (1-a)B) / a`. That kills the grey rim and gives smoke and
flame a believable soft falloff instead of a hard clip.

Holes are deliberately *not* filled — that would weld the arms to the body and
close real see-through gaps. Only components under `--min-area` are removed.

## Gotchas

- **Verifying alpha is misleading.** ffmpeg's *native* `vp8`/`vp9` decoders
  silently ignore WebM alpha, so a perfectly good file decodes as fully opaque.
  Force the libvpx wrapper: `ffmpeg -c:v libvpx-vp9 -i out.webm ...`.
  `encode.sh` self-checks this way and fails loudly.
- **VP9 beats VP8 here.** At matched size VP8 blocks up badly in the smoke;
  VP9 at CRF 40 stays smooth (~1.6 MB vs 2.3 MB at CRF 34).
- **`-auto-alt-ref 0` is required** or the alpha plane is dropped.
- **Playwright's bundled ffmpeg won't work** — it ships no PNG decoder. Both
  scripts search for a usable one and fall back to `imageio-ffmpeg`.
- **Safari does not support WebM alpha.** It needs HEVC-with-alpha in MP4,
  which only encodes on macOS via videotoolbox. Use the poster PNG as fallback,
  or render live in three.js if Safari parity matters.
