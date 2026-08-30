/**
 * Every number here was extracted from the Unity project. Do not "improve"
 * them -- they define the game's feel. Sources are noted so each can be
 * re-verified against the original.
 *
 * See PHASE0-FINDINGS.md and PLAN.md section 3.
 */

/** Unity ProjectSettings/Physics2DSettings.asset -> m_Gravity */
export const UNITY_GRAVITY_Y = -9.81;

/** PhysicsObject.cs */
export const MIN_GROUND_NORMAL_Y = 0.7;
export const MIN_MOVE_DISTANCE = 0.001;
export const SHELL_RADIUS = 0.01;

/** Player 1/2 prefabs. The script defaults differ (6.25) -- the prefab wins. */
export const PLAYER_SPEED = 6.5;
export const JUMP_TAKEOFF_SPEED = 12;
export const JUMP_BOOST_SPEED = 20;

/** PlayerController.cs -- how fast the runner skids to a halt after dying. */
export const SPEED_DECAY = 4.0;

/** Player 1 runs on the floor, Player 2 along the ceiling. */
export const GRAVITY_MODIFIER_P1 = 3;
export const GRAVITY_MODIFIER_P2 = -3;

/**
 * Player collider: an EdgeCollider2D on the root, which is scaled 0.375.
 * The raw points therefore overstate the hitbox ~2.7x. These are the resolved
 * world-space bounds relative to the transform origin (see tools/player_hitbox.py).
 *
 * The true shape is a slanted polyline, not a box; this AABB is the documented
 * approximation and is the first thing to tune if the feel is off.
 */
export const PLAYER_HITBOX = {
  minX: -0.3216,
  maxX: 0.2632,
  minY: -0.3465,
  maxY: 0.3105,
} as const;

/** Main Camera prefab: orthographicSize 10 -> 20 world units tall. */
export const CAMERA_ORTHO_SIZE = 10;
export const CAMERA_HEIGHT = CAMERA_ORTHO_SIZE * 2;

/** Camera root transform is (15, 9, -10); CameraController only moves x. */
export const CAMERA_Y = 9;

/** CameraController.cs -- constant auto-scroll once a player reaches the camera. */
export const CAMERA_SPEED = 7;

/**
 * Bound/* triggers, children of the Main Camera prefab (offsets from camera).
 *
 * NOTE: the x offsets below are the shipped literals, authored for the game's
 * original aspect ratio. On an arbitrary web viewport they place the win and
 * death lines inconsistently, so the runtime derives them from the camera
 * half-width instead -- see level.ts. Kept here for reference and A/B testing.
 */
export const SHIPPED_BOUND_WIN_X = 19.01;
export const SHIPPED_BOUND_LEFT_X = -23.15;
export const BOUND_TOP_Y = 15;
export const BOUND_BOTTOM_Y = -15;

/**
 * Fixed simulation step. The original ran physics in FixedUpdate but used
 * Time.deltaTime with targetFrameRate = 60, making it frame-rate coupled.
 * Pinning to 1/60 reproduces the intended feel deterministically.
 */
export const FIXED_DT = 1 / 60;

/** Levels are pixel grids: 1 px = 1 tile = 1 world unit. */
export const LEVEL_HEIGHT = 20;
