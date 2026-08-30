#!/usr/bin/env python3
"""
Emit the runtime data the web game loads: the authoritative colour->tile
mapping (order matters -- first match wins, exactly as Unity's linear scan did)
and the level ordering.

Tile *behaviour and visuals* live in TypeScript (src/game/tiles.ts); only the
data that must match Unity byte-for-byte is generated here.

Run:  .venv/bin/python tools/build_runtime_data.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
EXTRACTED = os.path.abspath(os.path.join(HERE, "..", "extracted"))
OUT = os.path.abspath(os.path.join(HERE, "..", "public", "assets", "data"))

src = json.load(open(os.path.join(EXTRACTED, "colormap.json")))

mappings = []
for e in src["colorMappings"]:
    mappings.append({
        "rgba": e["color"],
        "tile": os.path.basename(e["prefab"]).replace(".prefab", ""),
    })

levels = [os.path.basename(l["asset"]) for l in src["levels"]]

os.makedirs(OUT, exist_ok=True)
path = os.path.join(OUT, "levels.json")
with open(path, "w") as fh:
    json.dump({"mappings": mappings, "levels": levels}, fh, indent=1)

print("mappings: %d (order preserved -- first match wins)" % len(mappings))
print("levels  : %d" % len(levels))
print("wrote %s" % path)
