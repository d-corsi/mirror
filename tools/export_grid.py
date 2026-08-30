#!/usr/bin/env python3
"""
Dump a level's decoded grid to JSON so the headless physics harness can run
without a DOM. Applies exactly the same rules as the runtime loader:
alpha-before-colour, first-match-wins, Unity bottom-left origin.

Run:  .venv/bin/python tools/export_grid.py [level_index]
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
DATA = json.load(open(os.path.join(ROOT, "public", "assets", "data", "levels.json")))

SOLID = {"Tile_0", "Tile_1", "Tile_2", "Tile_3", "Tile_4", "Tile_5",
         "Tile_6", "Tile_11", "Tile_12"}

idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
name = DATA["levels"][idx]
im = Image.open(os.path.join(ROOT, "public", "assets", "levels", name)).convert("RGBA")
W, H = im.size
px = im.load()

first = {}
for m in DATA["mappings"]:
    first.setdefault(tuple(m["rgba"]), m["tile"])

solid = [[0] * W for _ in range(H)]
spawn = {}
stars, obstacles, boosts = [], [], []

for row in range(H):
    y = H - 1 - row                      # Unity bottom-left origin
    for x in range(W):
        p = px[x, row]
        if p[3] == 0:                    # alpha BEFORE colour
            continue
        tile = first.get(p)
        if tile is None:
            continue
        if tile == "Player 1":
            spawn["p1"] = [x, y]
        elif tile == "Player 2":
            spawn["p2"] = [x, y]
        elif tile == "Tile_Star":
            stars.append([x, y])
        elif tile in ("Tile_7", "Tile_8"):
            obstacles.append([x, y])
        elif tile in ("Tile_9", "Tile_10"):
            boosts.append([x, y])
        elif tile in SOLID:
            solid[y][x] = 1

out = {"name": name, "width": W, "height": H, "solid": solid,
       "spawn": spawn, "stars": stars, "obstacles": obstacles, "boosts": boosts}
path = os.path.join(ROOT, "extracted", "grid_%d.json" % idx)
with open(path, "w") as fh:
    json.dump(out, fh)
print("%s  %dx%d  spawn=%s stars=%d obstacles=%d boosts=%d"
      % (name, W, H, spawn, len(stars), len(obstacles), len(boosts)))
print("wrote %s" % path)

# Raw RGBA dump so the real TypeScript Level loader can be exercised headlessly.
raw = im.tobytes()
raw_path = os.path.join(ROOT, "extracted", "level_%d.rgba" % idx)
with open(raw_path, "wb") as fh:
    fh.write(raw)
print("wrote %s (%d bytes, %dx%d RGBA)" % (raw_path, len(raw), W, H))
