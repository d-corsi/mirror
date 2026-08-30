#!/usr/bin/env python3
"""
Phase 0: copy the Unity assets the web build needs into public/assets/,
downscaling the oversized backgrounds and converting the font to woff2.

Source assets are never modified -- the Unity project stays a read-only reference.

Run:  .venv/bin/python tools/prepare_assets.py
"""
import json
import os
import shutil
import subprocess

from PIL import Image
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.abspath(os.path.join(HERE, "..", "..", "mirror", "Assets"))
PUBLIC = os.path.abspath(os.path.join(HERE, "..", "public", "assets"))
EXTRACTED = os.path.abspath(os.path.join(HERE, "..", "extracted"))

# Backgrounds ship at 4K; 1920 wide is plenty for a 20-unit-tall playfield.
MAX_BG_WIDTH = 1920

# Only what the game actually loads. The UI sprites from Images/UI are
# deliberately NOT shipped: the menus are HTML/CSS, so they would be ~3.5 MB of
# dead weight. Same for sprites.png / sprite_glow.png / stickman.png -- the
# player is drawn from the bone rig, and tiles from tileset.png alone.
IMAGES = [
    "Images/tileset.png",
    "Images/jump_arrow.png",
]
BACKGROUNDS = [
    "Images/background.png",
    "Images/background_completed.png",
]


def is_junk(name):
    """AppleDouble sidecars from the external drive copy."""
    return name.startswith("._") or name == ".DS_Store"


def copy_png(rel, dest_dir, max_width=None):
    src = os.path.join(ASSETS, rel)
    if not os.path.exists(src):
        print("   MISSING %s" % rel)
        return None
    os.makedirs(dest_dir, exist_ok=True)
    dst = os.path.join(dest_dir, os.path.basename(rel))
    im = Image.open(src)
    w, h = im.size
    if max_width and w > max_width:
        nh = round(h * max_width / w)
        im = im.convert("RGBA").resize((max_width, nh), Image.LANCZOS)
        im.save(dst, optimize=True)
        print("   %-38s %dx%d -> %dx%d  (%s -> %s)"
              % (rel, w, h, max_width, nh,
                 human(os.path.getsize(src)), human(os.path.getsize(dst))))
    else:
        shutil.copy2(src, dst)
        print("   %-38s %dx%d  %s" % (rel, w, h, human(os.path.getsize(dst))))
    return dst


def human(n):
    for u in ("B", "KB", "MB"):
        if n < 1024:
            return "%.0f%s" % (n, u)
        n /= 1024
    return "%.1fGB" % n


def main():
    total_before = total_after = 0

    print("=== LEVELS ===")
    d = os.path.join(PUBLIC, "levels")
    os.makedirs(d, exist_ok=True)
    # Copy only the levels the game actually references, in order. The Levels
    # folder also holds dev leftovers (level_z.png, test-level.png) that were
    # never wired into the levels[] array and must not ship.
    colormap = json.load(open(os.path.join(EXTRACTED, "colormap.json")))
    referenced = [os.path.basename(l["asset"]) for l in colormap["levels"]]
    for f in referenced:
        shutil.copy2(os.path.join(ASSETS, "Levels", f), os.path.join(d, f))
    print("   copied %d referenced level PNGs" % len(referenced))
    ondisk = {f for f in os.listdir(os.path.join(ASSETS, "Levels"))
              if f.endswith(".png") and not is_junk(f)}
    skipped = sorted(ondisk - set(referenced))
    if skipped:
        print("   skipped %d unreferenced dev file(s): %s"
              % (len(skipped), ", ".join(skipped)))

    print("=== IMAGES ===")
    for rel in IMAGES:
        copy_png(rel, os.path.join(PUBLIC, "images"))

    print("=== BACKGROUNDS (downscaled) ===")
    for rel in BACKGROUNDS:
        src = os.path.join(ASSETS, rel)
        if os.path.exists(src):
            total_before += os.path.getsize(src)
        dst = copy_png(rel, os.path.join(PUBLIC, "images"), max_width=MAX_BG_WIDTH)
        if dst:
            total_after += os.path.getsize(dst)

    print("=== MUSIC ===")
    # Source is 160 kbps stereo MP3. AAC at 96k is transparent enough for game
    # music, is supported by every current browser, and is ~40% smaller.
    md = os.path.join(PUBLIC, "music")
    os.makedirs(md, exist_ok=True)
    src_total = out_total = 0
    for f in sorted(os.listdir(os.path.join(ASSETS, "Music"))):
        if not f.endswith(".mp3") or is_junk(f):
            continue
        src = os.path.join(ASSETS, "Music", f)
        # spaces in filenames are a nuisance on the web
        safe = f.lower().replace(" ", "_").replace("(", "").replace(")", "")
        dst = os.path.join(md, safe[:-4] + ".m4a")
        rc = subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", src,
             "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", dst],
            stdin=subprocess.DEVNULL,
        ).returncode
        if rc != 0:
            print("   ffmpeg failed for %s -- copying the MP3 instead" % f)
            shutil.copy2(src, os.path.join(md, safe))
            continue
        src_total += os.path.getsize(src)
        out_total += os.path.getsize(dst)
        print("   %-40s -> %-34s %s -> %s"
              % (f, os.path.basename(dst), human(os.path.getsize(src)),
                 human(os.path.getsize(dst))))
    if src_total:
        print("   music total: %s -> %s (%.0f%% smaller)"
              % (human(src_total), human(out_total),
                 100 * (1 - out_total / src_total)))

    print("=== FONT ===")
    fd = os.path.join(PUBLIC, "font")
    os.makedirs(fd, exist_ok=True)
    otf = os.path.join(ASSETS, "Font", "Quicksand-Regular.otf")
    out = os.path.join(fd, "quicksand-regular.woff2")
    f = TTFont(otf)
    f.flavor = "woff2"
    f.save(out)
    print("   Quicksand-Regular.otf %s -> quicksand-regular.woff2 %s"
          % (human(os.path.getsize(otf)), human(os.path.getsize(out))))

    print()
    if total_before:
        print("backgrounds: %s -> %s" % (human(total_before), human(total_after)))
    tot = sum(os.path.getsize(os.path.join(r, f))
              for r, _d, fs in os.walk(PUBLIC) for f in fs)
    print("total public/assets: %s" % human(tot))


if __name__ == "__main__":
    main()
