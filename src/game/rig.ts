/**
 * Player rendering from the original bone rig.
 *
 * The Unity character is a sprite-rigged mesh deformed by an 11-bone skeleton.
 * Canvas2D cannot skin a mesh -- but the character IS a stick figure built from
 * capsules, so drawing the bones directly reproduces it closely, using the real
 * hierarchy and the real animation curves exported from the .anim clips.
 *
 * Bones point along their local +X; a child's local position sits at the end of
 * its parent, so a bone's length is its child's local x offset.
 */
import { asset } from "../core/paths.ts";

export interface BoneDef {
  name: string;
  parent: string | null;
  pos: [number, number];
  rotZ: number;
}

export interface Keyframe {
  t: number;
  z: number;
}

export interface Clip {
  length: number;
  tracks: Record<string, Keyframe[]>;
}

export interface RigData {
  bones: Record<string, BoneDef>;
  clips: Record<string, Clip>;
}

/** Player root scale from the prefab -- bone units are in the root's local space. */
const RIG_SCALE = 0.375;

/** Leaf bones have no child to measure against, so they get a nominal length. */
const LEAF_LENGTH = 0.3;

const DEG = Math.PI / 180;

export interface PosedBone {
  x: number;
  y: number;
  angle: number;
  length: number;
}

export class Rig {
  private order: string[] = [];
  private children = new Map<string, string[]>();
  private lengths = new Map<string, number>();

  readonly data: RigData;

  constructor(data: RigData) {
    this.data = data;
    const bones = data.bones;
    for (const name of Object.keys(bones)) {
      const parent = bones[name]!.parent;
      if (parent) {
        const list = this.children.get(parent) ?? [];
        list.push(name);
        this.children.set(parent, list);
      }
    }
    // A bone's own length is only used for leaves; branch bones are drawn as
    // segments to each child instead (see segments()), because picking one
    // child arbitrarily gives the wrong length wherever the rig forks.
    for (const name of Object.keys(bones)) {
      const kids = this.children.get(name) ?? [];
      // Continuation child = the one furthest along this bone's own axis.
      let best = LEAF_LENGTH;
      for (const kid of kids) {
        best = Math.max(best, Math.hypot(bones[kid]!.pos[0], bones[kid]!.pos[1]));
      }
      this.lengths.set(name, best);
    }
    // Parents before children, so forward kinematics is a single pass.
    const visit = (name: string) => {
      this.order.push(name);
      for (const kid of this.children.get(name) ?? []) visit(kid);
    };
    for (const name of Object.keys(bones)) {
      if (!bones[name]!.parent) visit(name);
    }
  }

  childrenOf(name: string): string[] {
    return this.children.get(name) ?? [];
  }

  /** Samples a clip's rotation for one bone, looping and interpolating linearly. */
  private sample(clip: Clip | null, bone: string, time: number, fallback: number): number {
    const keys = clip?.tracks[bone];
    if (!keys || keys.length === 0) return fallback;
    if (keys.length === 1) return keys[0]!.z;

    const len = clip!.length || keys[keys.length - 1]!.t;
    const t = len > 0 ? time % len : 0;
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i]!;
      const b = keys[i + 1]!;
      if (t >= a.t && t <= b.t) {
        const span = b.t - a.t;
        const f = span > 0 ? (t - a.t) / span : 0;
        return a.z + (b.z - a.z) * f;
      }
    }
    return keys[keys.length - 1]!.z;
  }

  /**
   * Forward kinematics. Returns each bone's world-space start point, angle and
   * length, relative to the player's origin (already scaled to world units).
   */
  pose(clipName: string | null, time: number, flipY: boolean): Map<string, PosedBone> {
    const clip = clipName ? (this.data.clips[clipName] ?? null) : null;
    const out = new Map<string, PosedBone>();
    const world = new Map<string, { x: number; y: number; a: number }>();

    for (const name of this.order) {
      const def = this.data.bones[name]!;
      const localAngle = this.sample(clip, name, time, def.rotZ) * DEG;
      const parent = def.parent ? world.get(def.parent) : undefined;

      let x: number;
      let y: number;
      let a: number;
      if (parent) {
        const cos = Math.cos(parent.a);
        const sin = Math.sin(parent.a);
        x = parent.x + def.pos[0] * cos - def.pos[1] * sin;
        y = parent.y + def.pos[0] * sin + def.pos[1] * cos;
        a = parent.a + localAngle;
      } else {
        x = def.pos[0];
        y = def.pos[1];
        a = localAngle;
      }
      world.set(name, { x, y, a });

      const sy = flipY ? -1 : 1;
      out.set(name, {
        x: x * RIG_SCALE,
        y: y * RIG_SCALE * sy,
        angle: flipY ? -a : a,
        length: (this.lengths.get(name) ?? LEAF_LENGTH) * RIG_SCALE,
      });
    }
    return out;
  }
}

/**
 * Which clip plays for a given player state, mirroring the Animator parameters
 * PlayerController set: grounded, up, jump and death.
 */
export function clipFor(state: {
  dead: boolean;
  grounded: boolean;
  risingWithGravity: boolean;
}): string {
  if (state.dead) return "deathAnimation";
  if (state.grounded) return "runningAnimation";
  return state.risingWithGravity ? "flyUpAnimation" : "flyDownAnimation";
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Turns a pose into drawable segments: one per parent->child bone link, plus a
 * stub for each leaf so hands, feet and the head have something to draw.
 */
export function segments(rig: Rig, pose: Map<string, PosedBone>): {
  limbs: Segment[];
  head: { x: number; y: number } | null;
} {
  const limbs: Segment[] = [];
  let head: { x: number; y: number } | null = null;

  for (const [name, b] of pose) {
    const kids = rig.childrenOf(name);
    if (kids.length === 0) {
      const x2 = b.x + Math.cos(b.angle) * b.length;
      const y2 = b.y + Math.sin(b.angle) * b.length;
      if (name === "bone_11") head = { x: x2, y: y2 };
      else limbs.push({ x1: b.x, y1: b.y, x2, y2 });
      continue;
    }
    for (const kid of kids) {
      const c = pose.get(kid);
      if (c) limbs.push({ x1: b.x, y1: b.y, x2: c.x, y2: c.y });
    }
  }
  return { limbs, head };
}

export async function loadRig(): Promise<Rig> {
  const res = await fetch(asset("data/rig.json"));
  if (!res.ok) throw new Error(`rig data ${res.status}`);
  return new Rig((await res.json()) as RigData);
}
