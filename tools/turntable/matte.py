#!/usr/bin/env python3
"""Pull a transparent matte from a locked-off turntable video.

    python3 tools/turntable/matte.py --in shot.mp4 --out build/robot

Segmentation alone leaves a grey rim: partially-transparent edge pixels are a
mix of subject and backdrop, so compositing them over a dark page shows the
studio grey. Because the camera is locked off, the backdrop can be recovered
per-pixel (averaging each pixel over the frames where it is background) and
un-mixed out of the edges -- which also gives the flame a believable soft alpha
instead of a hard clip.

Writes RGBA frames to <out>/frame_%04d.png; encode them with encode.sh.
"""
import argparse
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image


def find_ffmpeg():
    """Playwright's bundled ffmpeg has no PNG decoder, so require a real one."""
    cands = [os.environ.get("FFMPEG"), "ffmpeg"]
    try:
        import imageio_ffmpeg

        cands.append(imageio_ffmpeg.get_ffmpeg_exe())
    except ImportError:
        pass
    for c in cands:
        if not c:
            continue
        try:
            out = subprocess.run([c, "-hide_banner", "-decoders"],
                                 capture_output=True, text=True).stdout
            if any(l.split()[1:2] == ["png"] for l in out.splitlines() if l.strip()):
                return c
        except (OSError, subprocess.SubprocessError):
            continue
    sys.exit("no ffmpeg with a PNG decoder; try: pip install imageio-ffmpeg")


def extract(ffmpeg, video, raw_dir, fps):
    os.makedirs(raw_dir, exist_ok=True)
    for f in os.listdir(raw_dir):
        if f.endswith(".png"):
            os.remove(os.path.join(raw_dir, f))
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", video]
    if fps:
        cmd += ["-vf", f"fps={fps}"]
    cmd += ["-start_number", "0", os.path.join(raw_dir, "frame_%04d.png")]
    subprocess.run(cmd, check=True)
    return sorted(f for f in os.listdir(raw_dir) if f.endswith(".png"))


def despeckle(alpha, min_area):
    """Drop specks and pinholes, but leave real negative space alone.

    Only components smaller than min_area are removed, so genuine see-through
    gaps between linkages survive -- filling holes wholesale would weld the
    arms to the body.
    """
    solid = (alpha > 0.5).astype(np.uint8)
    for invert in (False, True):
        src = 1 - solid if invert else solid
        n, lab, stats, _ = cv2.connectedComponentsWithStats(src, 8)
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] < min_area:
                solid[lab == i] = 1 if invert else 0
    return np.where(solid.astype(bool), np.maximum(alpha, 0.5), np.minimum(alpha, 0.5))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="video", required=True)
    p.add_argument("--out", default="build/matte")
    p.add_argument("--model", default="isnet-general-use")
    p.add_argument("--fps", type=float, default=0, help="0 keeps the source rate")
    p.add_argument("--shrink", type=float, default=0.6,
                   help="pixels to pull the matte in, hiding the segmentation halo")
    p.add_argument("--min-area", type=int, default=80)
    p.add_argument("--keep-plate", action="store_true", help="write the recovered backdrop")
    args = p.parse_args()

    from rembg import new_session, remove

    ffmpeg = find_ffmpeg()
    raw_dir = os.path.join(args.out, "_raw")
    os.makedirs(args.out, exist_ok=True)

    print("extracting frames...")
    names = extract(ffmpeg, args.video, raw_dir, args.fps)
    print(f"  {len(names)} frames")

    session = new_session(args.model)

    # Pass 1: segment every frame, and accumulate the backdrop from pixels that
    # are confidently background. Running sums keep memory flat regardless of
    # frame count.
    print("pass 1/2  segmenting + recovering backdrop")
    h = w = None
    plate_sum = plate_cnt = None
    alphas = []
    for i, n in enumerate(names):
        img = Image.open(os.path.join(raw_dir, n)).convert("RGB")
        cut = remove(img, session=session)
        a = np.asarray(cut.getchannel("A"), dtype=np.float32) / 255.0
        rgb = np.asarray(img, dtype=np.float32)
        if plate_sum is None:
            h, w = a.shape
            plate_sum = np.zeros((h, w, 3), np.float64)
            plate_cnt = np.zeros((h, w), np.float64)
        bg = (a < 0.02)[..., None]
        plate_sum += rgb * bg
        plate_cnt += bg[..., 0]
        np.save(os.path.join(raw_dir, f"a_{i:04d}.npy"), a)
        alphas.append(f"a_{i:04d}.npy")
        if (i + 1) % 20 == 0 or i == len(names) - 1:
            sys.stdout.write(f"\r  {i + 1}/{len(names)}")
            sys.stdout.flush()
    print()

    seen = plate_cnt > 0
    plate = np.zeros_like(plate_sum, np.float32)
    plate[seen] = (plate_sum[seen] / plate_cnt[seen, None]).astype(np.float32)
    # Pixels the subject never uncovers get filled from the surrounding backdrop,
    # which is a smooth studio gradient and extrapolates cleanly.
    holes = (~seen).astype(np.uint8)
    if holes.any():
        plate = cv2.inpaint(plate.astype(np.uint8), holes, 21, cv2.INPAINT_TELEA).astype(np.float32)
    print(f"  backdrop recovered ({100 * seen.mean():.1f}% observed, rest inpainted)")
    if args.keep_plate:
        Image.fromarray(plate.astype(np.uint8)).save(os.path.join(args.out, "backdrop.png"))

    # Pass 2: clean each matte and un-mix the backdrop out of its edges.
    print("pass 2/2  cleaning mattes + decontaminating edges")
    for i, n in enumerate(names):
        rgb = np.asarray(Image.open(os.path.join(raw_dir, n)).convert("RGB"), dtype=np.float32)
        a = np.load(os.path.join(raw_dir, alphas[i]))
        a = despeckle(a, args.min_area)
        if args.shrink > 0:
            k = max(3, int(args.shrink * 4) | 1)
            a = cv2.erode(a, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)),
                          iterations=1) * 0.5 + a * 0.5
            a = cv2.GaussianBlur(a, (0, 0), args.shrink)
        a = np.clip(a, 0, 1)

        # F = (I - (1-a)B) / a recovers the subject's own colour on blended
        # edges; below a floor the division is noise, so fall back to the plate.
        af = np.maximum(a, 1e-3)[..., None]
        fg = (rgb - (1.0 - a[..., None]) * plate) / af
        fg = np.where(a[..., None] > 0.02, fg, rgb)
        fg = np.clip(fg, 0, 255)

        out = np.dstack([fg, a * 255.0]).astype(np.uint8)
        Image.fromarray(out, "RGBA").save(os.path.join(args.out, f"frame_{i:04d}.png"))
        if (i + 1) % 20 == 0 or i == len(names) - 1:
            sys.stdout.write(f"\r  {i + 1}/{len(names)}")
            sys.stdout.flush()
    print(f"\nwrote {len(names)} RGBA frames -> {args.out}")


if __name__ == "__main__":
    main()
