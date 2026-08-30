#!/usr/bin/env python3
"""
Phase 0: resolve the players' true world-space collider bounds.

The EdgeCollider2D points are in the local space of whatever child holds it, and
the Player root is scaled 0.375, so the raw points overstate the hitbox. This
walks the Transform parent chain to get the real size the physics used.

Run:  .venv/bin/python tools/player_hitbox.py
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
PREFABS = os.path.abspath(os.path.join(HERE, "..", "..", "mirror", "Assets", "Prefabs"))
VEC3 = r"\{x: (-?[\d.eE+-]+), y: (-?[\d.eE+-]+), z: (-?[\d.eE+-]+)\}"


def docs(text):
    return [(int(m.group(1)), int(m.group(2)), m.group(3))
            for m in re.finditer(r"^--- !u!(\d+) &(-?\d+).*?\n(.*?)(?=^--- !u!|\Z)",
                                 text, re.S | re.M)]


def ref(body, name):
    m = re.search(r"^\s*%s: \{fileID: (-?\d+)" % name, body, re.M)
    return int(m.group(1)) if m else None


def analyse(path):
    text = open(path, errors="ignore").read()
    d = docs(text)

    transforms, go_to_tf, edges, names = {}, {}, [], {}
    for cid, fid, body in d:
        if cid == 1:
            m = re.search(r"^  m_Name: (.*)$", body, re.M)
            names[fid] = m.group(1).strip() if m else ""
        elif cid == 4:
            pos = re.search(r"m_LocalPosition: " + VEC3, body)
            sca = re.search(r"m_LocalScale: " + VEC3, body)
            go = ref(body, "m_GameObject")
            transforms[fid] = {
                "go": go,
                "father": ref(body, "m_Father"),
                "pos": [float(pos.group(1)), float(pos.group(2))] if pos else [0, 0],
                "scale": [float(sca.group(1)), float(sca.group(2))] if sca else [1, 1],
            }
            go_to_tf[go] = fid
        elif cid == 68:  # EdgeCollider2D
            pts = re.findall(r"- \{x: (-?[\d.eE+-]+), y: (-?[\d.eE+-]+)\}", body)
            edges.append((ref(body, "m_GameObject"),
                          [[float(a), float(b)] for a, b in pts]))

    print("=== %s ===" % os.path.basename(path))
    for go, pts in edges:
        # walk up the parent chain accumulating scale and offset
        chain, tf = [], go_to_tf.get(go)
        sx = sy = 1.0
        ox = oy = 0.0
        while tf:
            t = transforms[tf]
            chain.append((names.get(t["go"], "?") or "(unnamed)", t["scale"], t["pos"]))
            # child offset is scaled by the parent chain applied so far
            ox = t["pos"][0] + ox * t["scale"][0]
            oy = t["pos"][1] + oy * t["scale"][1]
            sx *= t["scale"][0]
            sy *= t["scale"][1]
            tf = t["father"]

        print("  collider on GameObject: %s" % (names.get(go) or "(unnamed)"))
        print("  transform chain (child -> root):")
        for nm, sc, ps in chain:
            print("     %-14s scale=%s pos=%s" % (nm, sc, ps))
        print("  cumulative scale: (%.6g, %.6g)" % (sx, sy))

        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        lw, lh = max(xs) - min(xs), max(ys) - min(ys)
        print("  local  bounds: x[%.4f, %.4f] y[%.4f, %.4f]  size %.4f x %.4f"
              % (min(xs), max(xs), min(ys), max(ys), lw, lh))
        print("  WORLD  size  : %.4f x %.4f  (tiles are 1x1)" % (lw * sx, lh * sy))
        print("  WORLD  bounds relative to transform origin: x[%.4f, %.4f] y[%.4f, %.4f]"
              % (min(xs) * sx, max(xs) * sx, min(ys) * sy, max(ys) * sy))
        print()


for f in ("Player 1.prefab", "Player 2.prefab"):
    analyse(os.path.join(PREFABS, f))
