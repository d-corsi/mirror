#!/usr/bin/env python3
"""
Phase 0 verification: histogram every colour actually present in the 21 level
PNGs and cross-check against the colour->prefab mapping extracted from Unity.

This is the empirical half of the mapping recovery -- it proves which mappings
the shipped levels really use, and catches any colour the mapping doesn't cover.

Run:  .venv/bin/python tools/analyze_levels.py
"""
import collections
import json
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LEVELS = os.path.abspath(os.path.join(HERE, "..", "..", "mirror", "Assets", "Levels"))
EXTRACTED = os.path.abspath(os.path.join(HERE, "..", "extracted"))

data = json.load(open(os.path.join(EXTRACTED, "colormap.json")))
mapping = {tuple(e["color"]): e for e in data["colorMappings"]}
# Unity's GenerateTile does a linear scan and takes the FIRST colour match,
# so when two entries share a colour the later one is unreachable.
first_match = {}
for e in data["colorMappings"]:
    first_match.setdefault(tuple(e["color"]), e)

totals = collections.Counter()
per_level = {}

for lv in data["levels"]:
    name = os.path.basename(lv["asset"])
    path = os.path.join(LEVELS, name)
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    counts = collections.Counter(im.getdata())
    per_level[name] = (w, h, counts)
    for col, n in counts.items():
        totals[col] += n

print("=== LEVEL DIMENSIONS ===")
heights = set()
for lv in data["levels"]:
    name = os.path.basename(lv["asset"])
    w, h, counts = per_level[name]
    heights.add(h)
    print("  %-16s %4d x %3d   distinct colours: %2d" % (name, w, h, len(counts)))
print("  heights present: %s" % sorted(heights))

print()
print("=== ALL COLOURS ACROSS ALL 21 LEVELS ===")
print("  %-22s %-10s %8s   %s" % ("rgba", "hex", "pixels", "maps to"))
unmapped = []
for col, n in totals.most_common():
    hexv = "#%02X%02X%02X%02X" % col
    if col[3] == 0:
        target = "(transparent - empty cell)"
    elif col in first_match:
        e = first_match[col]
        target = "%s  [entry %d]" % (os.path.basename(e["prefab"]), e["index"])
    else:
        target = "*** UNMAPPED ***"
        unmapped.append(col)
    print("  %-22s %-10s %8d   %s" % (str(col), hexv, n, target))

print()
if unmapped:
    print("!! %d UNMAPPED COLOUR(S) present in levels -- must resolve:" % len(unmapped))
    for c in unmapped:
        print("   %s" % ("#%02X%02X%02X%02X" % c))
else:
    print("OK: every non-transparent colour in every level resolves to a prefab.")

# Which mapping entries are never used by any level?
print()
print("=== MAPPING ENTRIES NEVER USED BY ANY LEVEL ===")
used = set(totals)
any_unused = False
for e in data["colorMappings"]:
    col = tuple(e["color"])
    reachable = first_match.get(col) is e
    if col not in used or not reachable:
        why = []
        if col not in used:
            why.append("colour absent from all levels")
        if not reachable:
            why.append("shadowed by earlier entry [%d]" % first_match[col]["index"])
        print("  [%2d] %-24s %s  -- %s"
              % (e["index"], os.path.basename(e["prefab"]), e["hex"], "; ".join(why)))
        any_unused = True
if not any_unused:
    print("  (none - all 16 entries are live)")

# Player spawn check: exactly one of each per level?
print()
print("=== PLAYER SPAWN PIXELS PER LEVEL ===")
p1 = (0, 0, 255, 255)
p2 = (255, 255, 0, 255)
ok = True
for lv in data["levels"]:
    name = os.path.basename(lv["asset"])
    w, h, counts = per_level[name]
    a, b = counts.get(p1, 0), counts.get(p2, 0)
    flag = "" if (a == 1 and b == 1) else "   <-- unexpected"
    if flag:
        ok = False
    print("  %-16s P1=%d  P2=%d%s" % (name, a, b, flag))
print("  " + ("OK: exactly one spawn pixel of each colour per level." if ok
              else "!! spawn counts are not uniformly 1/1 - inspect above."))
