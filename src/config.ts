/** Every tuning number lives here. Scenes and entities never hardcode gameplay values. */
export const CONFIG = {
  WIDTH: 480,
  /** Internal canvas is WIDTH*ZOOM; cameras zoom so world units stay 480x270 and text renders sharp. */
  ZOOM: 2,
  HEIGHT: 270,
  MAX_DT_MS: 50,

  PLAYER_SPEED: 110,
  PLAYER_BASE_HP: 100,
  DASH_SPEED: 330,
  DASH_DURATION_MS: 140,
  DASH_COOLDOWN_MS: 800,
  COMBO_HITS: 3,
  COMBO_RESET_MS: 500,
  ATTACK_COOLDOWN_MS: 220,
  ATTACK_RANGE: 22,
  FINISHER_MULT: 1.5,
  BASE_DAMAGE: 10,
  PARRY_WINDOW_MS: 150,
  PARRY_WHIFF_LOCK_MS: 350,
  STUN_MS: 1000,
  COUNTER_MULT: 2,
  HIT_INVULN_MS: 500,

  ROOMS_PER_RUN: 8,
  /** psychosis per second in combat, even with no implant: Neon City wears you down */
  PSY_BASE_RATE: 0.35,
  PSY_RATE_PER_LOAD: 0.035,
  PSY_PER_KILL: 1,
  PSY_DRAIN_SLOW: 3,
  PSY_DRAIN_FAST: 8,
  CRISIS_DAMAGE_MULT: 1.5,
  CRISIS_SPEED_MULT: 1.5,
  BLOCKER_AMOUNT: 30,
  HEAL_FRACTION: 0.3,

  BOSS_CREDIT_BONUS: 50,
  MIN_SPAWN_DIST: 64,
} as const;

export const COLORS = {
  night: 0x0b0820,
  cyan: 0x00f0ff,
  magenta: 0xff2a6d,
  yellow: 0xf5e663,
  white: 0xe8e8ff,
} as const;

export const SCENES = {
  Boot: 'Boot',
  Menu: 'Menu',
  Hideout: 'Hideout',
  Run: 'Run',
  Hud: 'Hud',
  Death: 'Death',
} as const;
