#!/usr/bin/env python3
"""
Extract the player's bone rig and its animation clips.

The player is a Unity 2D sprite-rigged character: a bone hierarchy driving a
deformed mesh. Canvas2D cannot skin a mesh, but the character IS a stick figure
made of capsules -- so we reproduce it by drawing the bones directly, using the
real hierarchy and the real rotation curves.

Run:  .venv/bin/python tools/extract_rig.py
"""
import json
import math
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.abspath(os.path.join(HERE, "..", "..", "mirror", "Assets"))
OUT = os.path.abspath(os.path.join(HERE, "..", "public", "assets", "data"))

PREFAB = os.path.join(ASSETS, "Prefabs", "Player 1.prefab")
ANIM_DIR = os.path.join(ASSETS, "Animations")

V3 = r"\{x: (-?[\d.eE+-]+), y: (-?[\d.eE+-]+), z: (-?[\d.eE+-]+)\}"
QUAT = r"\{x: (-?[\d.eE+-]+), y: (-?[\d.eE+-]+), z: (-?[\d.eE+-]+), w: (-?[\d.eE+-]+)\}"


def docs(text):
    return [(int(m.group(1)), int(m.group(2)), m.group(3))
            for m in re.finditer(r"^--- !u!(\d+) &(-?\d+).*?\n(.*?)(?=^--- !u!|\Z)",
                                 text, re.S | re.M)]


def ref(body, name):
    m = re.search(r"^\s*%s: \{fileID: (-?\d+)" % name, body, re.M)
    return int(m.group(1)) if m else None


def quat_to_z_deg(x, y, z, w):
    """Planar rig: only the Z component matters."""
    return math.degrees(math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z)))


def extract_rig():
    text = open(PREFAB, errors="ignore").read()
    names, transforms = {}, {}

    for cid, fid, body in docs(text):
        if cid == 1:
            m = re.search(r"^  m_Name: (.*)$", body, re.M)
            names[fid] = m.group(1).strip() if m else ""
        elif cid == 4:
            pos = re.search(r"m_LocalPosition: " + V3, body)
            rot = re.search(r"m_LocalRotation: " + QUAT, body)
            transforms[fid] = {
                "go": ref(body, "m_GameObject"),
                "father": ref(body, "m_Father"),
                "pos": [float(pos.group(1)), float(pos.group(2))] if pos else [0, 0],
                "rotZ": quat_to_z_deg(*[float(g) for g in rot.groups()]) if rot else 0.0,
            }

    bones = {}
    for fid, t in transforms.items():
        name = names.get(t["go"], "")
        if not name.startswith("bone_"):
            continue
        parent_name = names.get(transforms.get(t["father"], {}).get("go"), None)
        bones[name] = {
            "name": name,
            "parent": parent_name if (parent_name or "").startswith("bone_") else None,
            "pos": [round(v, 6) for v in t["pos"]],
            "rotZ": round(t["rotZ"], 4),
        }
    return bones


def parse_clip(path):
    text = open(path, errors="ignore").read()
    name = re.search(r"^  m_Name: (.*)$", text, re.M).group(1).strip()
    tracks = {}

    # Only the m_EulerCurves section. The file also holds m_PositionCurves and
    # m_ScaleCurves whose values are vectors too -- scanning the whole file lets
    # those overwrite the rotations with zeros.
    section = re.search(
        r"^  m_EulerCurves:\s*\n(.*?)(?=^  m_[A-Za-z]+:)", text, re.S | re.M
    )
    if not section:
        return name, {"length": 0.0, "tracks": {}}
    euler = section.group(1)

    # Each entry of m_EulerCurves is one bone path with a list of keyframes.
    for block in re.finditer(
        r"- curve:\s*\n(.*?)\n\s*path: (\S+)", euler, re.S
    ):
        body, bone_path = block.group(1), block.group(2)
        keys = []
        for k in re.finditer(r"time: ([-\d.eE+]+)\s*\n\s*value: " + V3, body):
            keys.append({
                "t": round(float(k.group(1)), 6),
                "z": round(float(k.group(4)), 4),
            })
        if keys:
            tracks[bone_path.split("/")[-1]] = keys

    length = max((k["t"] for ks in tracks.values() for k in ks), default=0.0)
    return name, {"length": round(length, 6), "tracks": tracks}


def main():
    bones = extract_rig()
    print("=== BONES ===")
    for b in sorted(bones.values(), key=lambda b: b["name"]):
        print("  %-9s parent=%-9s pos=(%7.4f,%7.4f) rotZ=%8.3f"
              % (b["name"], b["parent"], b["pos"][0], b["pos"][1], b["rotZ"]))

    clips = {}
    print("\n=== CLIPS ===")
    for f in sorted(os.listdir(ANIM_DIR)):
        if not f.endswith(".anim") or f.startswith("._"):
            continue
        name, clip = parse_clip(os.path.join(ANIM_DIR, f))
        if not clip["tracks"]:
            print("  %-22s (no euler curves - skipped)" % name)
            continue
        clips[name] = clip
        print("  %-22s length=%.3fs  bones=%d  keys=%d"
              % (name, clip["length"], len(clip["tracks"]),
                 sum(len(v) for v in clip["tracks"].values())))

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "rig.json")
    with open(path, "w") as fh:
        json.dump({"bones": bones, "clips": clips}, fh, separators=(",", ":"))
    print("\nwrote %s (%d bytes)" % (path, os.path.getsize(path)))


if __name__ == "__main__":
    main()
