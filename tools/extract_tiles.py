#!/usr/bin/env python3
"""
Phase 0: extract per-tile data (tag, collider shape, sprite layers) from the
Unity tile prefabs into extracted/tiles.json.

Unity prefabs are multi-document YAML. Each document is "--- !u!<classId> &<fileId>"
followed by a typed block. We only need a handful of component types, so this
parses them directly rather than pulling in a YAML dependency.

Run:  .venv/bin/python tools/extract_tiles.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
UNITY = os.path.abspath(os.path.join(HERE, "..", "..", "mirror"))
ASSETS = os.path.join(UNITY, "Assets")
EXTRACTED = os.path.abspath(os.path.join(HERE, "..", "extracted"))

CLASS = {1: "GameObject", 4: "Transform", 212: "SpriteRenderer",
         58: "CircleCollider2D", 60: "PolygonCollider2D", 61: "BoxCollider2D",
         68: "EdgeCollider2D", 50: "Rigidbody2D", 95: "Animator",
         114: "MonoBehaviour"}

VEC = r"\{x: (-?[\d.eE+-]+), y: (-?[\d.eE+-]+)"


def guid_map():
    out = {}
    for root, _d, files in os.walk(ASSETS):
        for f in files:
            if not f.endswith(".meta"):
                continue
            p = os.path.join(root, f)
            with open(p, errors="ignore") as fh:
                for line in fh:
                    if line.startswith("guid: "):
                        out[line.split(" ", 1)[1].strip()] = os.path.relpath(p[:-5], ASSETS)
                        break
    return out


def parse_docs(text):
    """Split a Unity YAML asset into [(classId, fileId, body), ...]."""
    docs = []
    for m in re.finditer(r"^--- !u!(\d+) &(-?\d+).*?\n(.*?)(?=^--- !u!|\Z)",
                         text, re.S | re.M):
        docs.append((int(m.group(1)), int(m.group(2)), m.group(3)))
    return docs


def field(body, name, default=None):
    m = re.search(r"^\s*%s: (.*)$" % re.escape(name), body, re.M)
    return m.group(1).strip() if m else default


def ref_fileid(body, name):
    m = re.search(r"^\s*%s: \{fileID: (-?\d+)" % re.escape(name), body, re.M)
    return int(m.group(1)) if m else None


def sprite_ref(body):
    m = re.search(r"^\s*m_Sprite: \{fileID: (-?\d+)(?:, guid: ([0-9a-f]+))?",
                  body, re.M)
    if not m:
        return None
    return {"fileID": int(m.group(1)), "guid": m.group(2)}


def polygon_points(body, key="m_Points"):
    """
    All paths under m_Points / m_Poinst-style blocks.

    PolygonCollider2D nests the data one level deeper under `m_Paths:`, so the
    terminator must not stop on that sub-key (EdgeCollider2D has no such nesting).
    """
    m = re.search(r"^\s*%s:\s*\n(.*?)(?=^\s*m_(?!Paths\b)[A-Z]\w*:|\Z)" % key,
                  body, re.S | re.M)
    if not m:
        return []
    block = m.group(1)
    paths, current = [], []
    for line in block.splitlines():
        if re.match(r"^\s*- - \{x:", line):          # start of a new path
            if current:
                paths.append(current)
            current = []
        pm = re.search(VEC, line)
        if pm:
            current.append([round(float(pm.group(1)), 6), round(float(pm.group(2)), 6)])
    if current:
        paths.append(current)
    return paths


def parse_prefab(path, gmap):
    text = open(path, errors="ignore").read()
    docs = parse_docs(text)

    gos, transforms, comps = {}, {}, []
    for cid, fid, body in docs:
        kind = CLASS.get(cid, "Class%d" % cid)
        if kind == "GameObject":
            gos[fid] = {
                "name": field(body, "m_Name"),
                "tag": field(body, "m_TagString"),
                "active": field(body, "m_IsActive") == "1",
            }
        elif kind == "Transform":
            transforms[fid] = {
                "go": ref_fileid(body, "m_GameObject"),
                "father": ref_fileid(body, "m_Father"),
                "pos": re.search(r"m_LocalPosition: " + VEC, body),
            }
        elif kind in ("PolygonCollider2D", "BoxCollider2D", "CircleCollider2D",
                      "EdgeCollider2D", "SpriteRenderer", "Animator"):
            comps.append((kind, fid, body))

    colliders, sprites, animated = [], [], False
    for kind, _fid, body in comps:
        go = gos.get(ref_fileid(body, "m_GameObject"), {})
        if kind == "Animator":
            animated = True
        elif kind == "SpriteRenderer":
            s = sprite_ref(body)
            sprites.append({
                "object": go.get("name"),
                "enabled": field(body, "m_Enabled") == "1",
                "sortingOrder": field(body, "m_SortingOrder"),
                "texture": gmap.get(s["guid"]) if s and s.get("guid") else None,
                "spriteFileID": s["fileID"] if s else None,
            })
        else:
            off = re.search(r"m_Offset: " + VEC, body)
            c = {
                "type": kind,
                "object": go.get("name"),
                "tag": go.get("tag"),
                "isTrigger": field(body, "m_IsTrigger") == "1",
                "enabled": field(body, "m_Enabled") == "1",
                "offset": [float(off.group(1)), float(off.group(2))] if off else [0, 0],
            }
            if kind == "PolygonCollider2D":
                c["paths"] = polygon_points(body)
            elif kind == "EdgeCollider2D":
                c["paths"] = polygon_points(body)
                c["edgeRadius"] = float(field(body, "m_EdgeRadius", "0"))
            elif kind == "BoxCollider2D":
                sz = re.search(r"m_Size: " + VEC, body)
                c["size"] = [float(sz.group(1)), float(sz.group(2))] if sz else None
            elif kind == "CircleCollider2D":
                c["radius"] = float(field(body, "m_Radius", "0"))
            colliders.append(c)

    # root GameObject = the one whose transform has no father
    root = None
    for _fid, t in transforms.items():
        if not t["father"]:
            root = gos.get(t["go"])
            break

    return {
        "name": os.path.basename(path).replace(".prefab", ""),
        "rootTag": (root or {}).get("tag"),
        "animated": animated,
        "tags": sorted({g["tag"] for g in gos.values() if g["tag"] and g["tag"] != "Untagged"}),
        "colliders": colliders,
        "sprites": sprites,
    }


def main():
    gmap = guid_map()
    colormap = json.load(open(os.path.join(EXTRACTED, "colormap.json")))

    # which prefabs the levels actually reference, and under what colour
    by_prefab = {}
    for e in colormap["colorMappings"]:
        by_prefab.setdefault(os.path.basename(e["prefab"]), []).append(e)

    tiles = {}
    tdir = os.path.join(ASSETS, "TilesPrefabs")
    for f in sorted(os.listdir(tdir)):
        if f.endswith(".prefab"):
            info = parse_prefab(os.path.join(tdir, f), gmap)
            entries = by_prefab.get(f, [])
            info["colors"] = [e["hex"] for e in entries]
            info["mappingIndex"] = [e["index"] for e in entries]
            tiles[info["name"]] = info

    for f in ("Player 1.prefab", "Player 2.prefab"):
        info = parse_prefab(os.path.join(ASSETS, "Prefabs", f), gmap)
        entries = by_prefab.get(f, [])
        info["colors"] = [e["hex"] for e in entries]
        info["mappingIndex"] = [e["index"] for e in entries]
        tiles[info["name"]] = info

    os.makedirs(EXTRACTED, exist_ok=True)
    with open(os.path.join(EXTRACTED, "tiles.json"), "w") as fh:
        json.dump(tiles, fh, indent=2)

    print("=== TILE / ENTITY SUMMARY ===")
    print("%-12s %-10s %-9s %-26s %s" % ("name", "rootTag", "colour", "colliders", "sprite layers"))
    for name, t in tiles.items():
        cols = ",".join(t["colors"]) or "-unused-"
        cdesc = []
        for c in t["colliders"]:
            d = c["type"].replace("Collider2D", "")
            if c["type"] in ("PolygonCollider2D", "EdgeCollider2D"):
                d += "(%s)" % ("+".join(str(len(p)) for p in c["paths"]) or "0")
            elif c["type"] == "BoxCollider2D" and c.get("size"):
                d += "(%gx%g)" % tuple(c["size"])
            if c["isTrigger"]:
                d += "*trig"
            if not c["enabled"]:
                d += "*off"
            if c["tag"] and c["tag"] != "Untagged":
                d += "[%s]" % c["tag"]
            cdesc.append(d)
        layers = ",".join(
            os.path.basename(s["texture"] or "?").replace(".png", "")
            for s in t["sprites"])
        print("%-12s %-10s %-9s %-26s %s%s"
              % (name, t["rootTag"], cols, " ".join(cdesc) or "none", layers,
                 "  [ANIM]" if t["animated"] else ""))

    print()
    print("all tags seen across tile prefabs:")
    allt = sorted({tag for t in tiles.values() for tag in t["tags"]})
    print("  " + ", ".join(allt))
    print()
    print("wrote %s" % os.path.join(EXTRACTED, "tiles.json"))


if __name__ == "__main__":
    main()
