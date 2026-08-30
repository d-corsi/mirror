#!/usr/bin/env python3
"""
Phase 0 extraction: pull the authoritative level colour->tile mapping, the level
ordering and the per-tile collision data out of the Unity project.

Unity stores this as a base prefab (GameManager.prefab) plus a set of
prefab-instance overrides in GameScene.unity. Both must be merged, overrides
winning, to get what the game actually ran with.

Run:  python3 tools/extract_unity.py
"""
import json
import os
import re
import sys

UNITY = os.path.join(os.path.dirname(__file__), "..", "..", "mirror")
UNITY = os.path.abspath(UNITY)
ASSETS = os.path.join(UNITY, "Assets")
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "extracted"))

GAMEMANAGER = os.path.join(ASSETS, "Prefabs", "GameManager.prefab")
SCENE = os.path.join(ASSETS, "Scenes", "GameScene.unity")


def guid_map():
    """guid -> asset path, from every .meta file in Assets/"""
    out = {}
    for root, _dirs, files in os.walk(ASSETS):
        for f in files:
            if not f.endswith(".meta"):
                continue
            p = os.path.join(root, f)
            try:
                with open(p, "r", errors="ignore") as fh:
                    for line in fh:
                        if line.startswith("guid: "):
                            g = line.split(" ", 1)[1].strip()
                            out[g] = os.path.relpath(p[:-5], ASSETS)
                            break
            except OSError:
                pass
    return out


def to_255(v):
    """Unity stores colour channels as 0..1 floats; level PNGs are 8-bit."""
    return int(round(float(v) * 255))


def parse_base_levels(text):
    """Parse the levels: array block out of GameManager.prefab."""
    m = re.search(r"^  levels:\n(.*?)(?=^  colorMappings:|^---|\Z)", text, re.S | re.M)
    if not m:
        return []
    return re.findall(r"- \{fileID: -?\d+, guid: ([0-9a-f]+),", m.group(1))


def parse_base_colormappings(text):
    """Parse the colorMappings: block out of GameManager.prefab."""
    m = re.search(r"^  colorMappings:\n(.*?)(?=^---|\Z)", text, re.S | re.M)
    if not m:
        return []
    block = m.group(1)
    entries = []
    # each entry: "  - color: {...}\n    prefab: {fileID: N, guid: G,\n      type: 3}"
    for em in re.finditer(
        r"- color: \{r: ([\d.eE+-]+), g: ([\d.eE+-]+), b: ([\d.eE+-]+), a: ([\d.eE+-]+)\}"
        r"\s*\n\s*prefab: \{fileID: (-?\d+), guid: ([0-9a-f]+),",
        block,
    ):
        r, g, b, a, _fid, guid = em.groups()
        entries.append(
            {
                "color": [to_255(r), to_255(g), to_255(b), to_255(a)],
                "guid": guid,
            }
        )
    return entries


def parse_scene_overrides(text):
    """
    Collect prefab-instance overrides targeting colorMappings / levels.
    Returns (colormapping_overrides, level_overrides, array_sizes).
    """
    # Normalise wrapped "target: {...}" blocks so each override is one record.
    recs = re.findall(
        r"- target: \{fileID: (-?\d+), guid: ([0-9a-f]+),\s*\n?\s*type: \d+\}\s*\n"
        r"\s*propertyPath: (\S+)\s*\n"
        r"\s*value:\s*(.*?)\s*\n"
        r"\s*objectReference: \{fileID: (-?\d+)(?:, guid: ([0-9a-f]+))?",
        text,
    )
    cm = {}
    levels = {}
    sizes = {}
    for _fid, _tguid, path, value, _oref_fid, oref_guid in recs:
        if path == "colorMappings.Array.size":
            sizes["colorMappings"] = int(value)
        elif path == "levels.Array.size":
            sizes["levels"] = int(value)
        m = re.match(r"colorMappings\.Array\.data\[(\d+)\]\.(.+)$", path)
        if m:
            idx, field = int(m.group(1)), m.group(2)
            cm.setdefault(idx, {})[field] = (value, oref_guid)
            continue
        m = re.match(r"levels\.Array\.data\[(\d+)\]$", path)
        if m:
            levels[int(m.group(1))] = oref_guid
    return cm, levels, sizes


def main():
    gm = guid_map()
    base_txt = open(GAMEMANAGER, errors="ignore").read()
    scene_txt = open(SCENE, errors="ignore").read()

    base = parse_base_colormappings(base_txt)
    cm_over, level_over, sizes = parse_scene_overrides(scene_txt)

    print(f"base colorMappings entries : {len(base)}")
    print(f"scene array sizes          : {sizes}")
    print(f"scene colorMapping overrides: {len(cm_over)} entries touched")
    print(f"scene level overrides      : {len(level_over)}")
    print()

    size = sizes.get("colorMappings", len(base))
    merged = []
    for i in range(size):
        entry = dict(base[i]) if i < len(base) else {"color": [0, 0, 0, 0], "guid": None}
        color = list(entry["color"])
        guid = entry["guid"]
        ov = cm_over.get(i, {})
        for field, (value, oref_guid) in ov.items():
            if field == "prefab":
                guid = oref_guid or guid
            elif field.startswith("color."):
                ch = field.split(".")[1]
                idx = {"r": 0, "g": 1, "b": 2, "a": 3}[ch]
                color[idx] = to_255(value)
        merged.append(
            {
                "index": i,
                "color": color,
                "hex": "#%02X%02X%02X%02X" % tuple(color),
                "guid": guid,
                "prefab": gm.get(guid, "??? " + str(guid)),
                "overridden": sorted(ov.keys()) or None,
            }
        )

    print("=== MERGED COLOUR -> PREFAB MAPPING (scene-authoritative) ===")
    for e in merged:
        ov = (" [override: %s]" % ",".join(e["overridden"])) if e["overridden"] else ""
        print(
            "  [%2d] rgba%-18s %s  -> %s%s"
            % (e["index"], tuple(e["color"]), e["hex"], e["prefab"], ov)
        )

    # duplicate colour detection -- Unity matches the FIRST entry, so dupes are dead entries
    seen = {}
    dupes = []
    for e in merged:
        k = tuple(e["color"])
        if k in seen:
            dupes.append((seen[k], e["index"], e["hex"]))
        else:
            seen[k] = e["index"]
    print()
    if dupes:
        print("!! DUPLICATE COLOURS (later entry is unreachable):")
        for first, later, hexv in dupes:
            print("   %s  first=[%d]  shadowed=[%d]" % (hexv, first, later))
    else:
        print("no duplicate colours")

    # level ordering
    base_levels = parse_base_levels(base_txt)
    nlevels = sizes.get("levels", len(base_levels))
    levels = []
    for i in range(nlevels):
        # scene override wins; otherwise fall back to the base prefab array
        g = level_over.get(i) or (base_levels[i] if i < len(base_levels) else None)
        levels.append(
            {
                "index": i,
                "guid": g,
                "asset": gm.get(g, "??? " + str(g)),
                "source": "scene" if level_over.get(i) else "base",
            }
        )
    print()
    print("=== LEVEL ORDER (levels[i], game uses levels[currentLevel-1]) ===")
    for l in levels:
        print("  [%2d] %-24s (%s)" % (l["index"], l["asset"], l["source"]))

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "colormap.json"), "w") as fh:
        json.dump({"colorMappings": merged, "levels": levels}, fh, indent=2)
    print()
    print("wrote %s" % os.path.join(OUT, "colormap.json"))


if __name__ == "__main__":
    sys.exit(main())
