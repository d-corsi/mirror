#!/usr/bin/env python3
"""
Phase 0: extract sprite-sheet slicing (sub-sprite names + rects) from Unity
texture .meta files into extracted/sprites.json.

Unity rects use a BOTTOM-LEFT origin; canvas drawImage uses TOP-LEFT. Both are
emitted so the importer can't get it wrong.

Run:  .venv/bin/python tools/extract_sprites.py
"""
import json
import os
import re

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.abspath(os.path.join(HERE, "..", "..", "mirror", "Assets"))
EXTRACTED = os.path.abspath(os.path.join(HERE, "..", "extracted"))


def parse_meta(path):
    text = open(path, errors="ignore").read()
    ppu = re.search(r"^\s*spritePixelsToUnits: ([\d.]+)", text, re.M)
    mode = re.search(r"^\s*spriteMode: (\d+)", text, re.M)
    sprites = []
    # each sub-sprite block: name, rect{x,y,width,height}, pivot, spriteID
    for m in re.finditer(
        r"- serializedVersion: \d+\s*\n\s*name: (\S+)\s*\n"
        r"\s*rect:\s*\n\s*serializedVersion: \d+\s*\n"
        r"\s*x: ([\d.]+)\s*\n\s*y: ([\d.]+)\s*\n"
        r"\s*width: ([\d.]+)\s*\n\s*height: ([\d.]+)",
        text,
    ):
        name, x, y, w, h = m.groups()
        sprites.append({
            "name": name,
            "x": int(float(x)), "y": int(float(y)),
            "w": int(float(w)), "h": int(float(h)),
        })
    return {
        "pixelsPerUnit": float(ppu.group(1)) if ppu else None,
        "spriteMode": int(mode.group(1)) if mode else None,
        "sprites": sprites,
    }


def main():
    out = {}
    for root, _d, files in os.walk(ASSETS):
        for f in sorted(files):
            if not f.endswith(".png.meta"):
                continue
            meta = os.path.join(root, f)
            info = parse_meta(meta)
            if not info["sprites"] and info["spriteMode"] != 1:
                continue
            png = meta[:-5]
            rel = os.path.relpath(png, ASSETS)
            try:
                W, H = Image.open(png).size
            except OSError:
                continue
            # convert Unity bottom-left rects to canvas top-left
            for s in info["sprites"]:
                s["canvasY"] = H - s["y"] - s["h"]
            info["image"] = rel
            info["imageSize"] = [W, H]
            out[rel] = info

    os.makedirs(EXTRACTED, exist_ok=True)
    with open(os.path.join(EXTRACTED, "sprites.json"), "w") as fh:
        json.dump(out, fh, indent=2)

    print("=== SLICED SPRITE SHEETS ===")
    for rel, info in sorted(out.items()):
        if not info["sprites"]:
            continue
        print("\n%s  %dx%d  ppu=%s  (%d sub-sprites)"
              % (rel, info["imageSize"][0], info["imageSize"][1],
                 info["pixelsPerUnit"], len(info["sprites"])))
        for s in info["sprites"]:
            print("   %-14s unity(x=%3d,y=%3d) canvas(x=%3d,y=%3d) %dx%d"
                  % (s["name"], s["x"], s["y"], s["x"], s["canvasY"], s["w"], s["h"]))

    single = [r for r, i in out.items() if not i["sprites"]]
    print("\nsingle-sprite textures (no slicing needed): %d" % len(single))
    print("wrote %s" % os.path.join(EXTRACTED, "sprites.json"))


if __name__ == "__main__":
    main()
