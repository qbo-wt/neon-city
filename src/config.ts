/** Every tuning number lives here. Scenes and entities never hardcode gameplay values. */
export const CONFIG = {
  WIDTH: 480,
  /** Internal canvas is WIDTH*ZOOM; cameras zoom so world units stay 480x270 and text renders sharp. */
  ZOOM: 4,
  HEIGHT: 270,
  MAX_DT_MS: 50,

  /** walking speed in the apartment and the building (px/s) */
  PLAYER_SPEED: 110,
  PLAYER_BASE_HP: 120,
  PLAYER_PA: 6,
  PLAYER_PM: 3,
  PLAYER_INIT: 100,
  /** Surchauffe: +PA once per turn, for some psychosis */
  OVERHEAT_PA: 2,
  OVERHEAT_PSY: 12,
  /** enemies get tougher sector after sector */
  DEPTH_HP: 0.06,
  DEPTH_DAMAGE: 0.03,
  /** reinforcements (the next wave) arrive at the start of these rounds */
  REINFORCE_ROUNDS: [3, 5],

  ROOMS_PER_RUN: 10,
  /** a boss fight, alone, every N sectors; the last one ends the run */
  BOSS_EVERY: 5,
  /** psychosis at the start of each of your turns, even with no implant: Neon City wears you down */
  PSY_PER_TURN: 1.5,
  PSY_PER_TURN_PER_LOAD: 0.06,
  PSY_PER_KILL: 2,
  /** HP lost at the start of each turn at 75 % psychosis and in crisis (fraction of max HP) */
  PSY_DRAIN_SLOW: 0.03,
  PSY_DRAIN_FAST: 0.07,
  /** psychosis is also power: damage / speed bonuses per tier (glitch 50 %, drain 75 %, crisis 100 %) */
  PSY_GLITCH_DAMAGE: 1.1,
  PSY_DRAIN_DAMAGE: 1.25,
  CRISIS_DAMAGE_MULT: 1.5,
  /** in cyberpsychosis every kill heals a little: you can ride the edge if you keep killing */
  CRISIS_KILL_HEAL: 6,
  BLOCKER_AMOUNT: 30,
  HEAL_FRACTION: 0.3,

  BOSS_CREDIT_BONUS: 30,
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
  Building: 'Building',
  Ripperdoc: 'Ripperdoc',
  Netrunner: 'Netrunner',
} as const;
