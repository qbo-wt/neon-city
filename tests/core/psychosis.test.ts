import { describe, it, expect } from 'vitest';
import { psyTier, tickPsychosis, psyOnKill, applyBlocker, hpDrainPerSec, crisisMultipliers } from '../../src/core/psychosis';
import { CONFIG } from '../../src/config';

describe('psychosis', () => {
  it('tiers at boundaries', () => {
    expect(psyTier(49.9)).toBe('stable');
    expect(psyTier(50)).toBe('glitch');
    expect(psyTier(74.9)).toBe('glitch');
    expect(psyTier(75)).toBe('drain');
    expect(psyTier(99.9)).toBe('drain');
    expect(psyTier(100)).toBe('crisis');
  });
  it('zero load does not rise', () => {
    expect(tickPsychosis(10, 0, 1000, 0)).toBe(10);
  });
  it('rises by load * rate * dtSec', () => {
    expect(tickPsychosis(0, 10, 50, 0)).toBeCloseTo(10 * CONFIG.PSY_RATE_PER_LOAD * 0.05);
  });
  it('clamps huge dt to MAX_DT_MS', () => {
    expect(tickPsychosis(0, 10, 100000, 0)).toBe(tickPsychosis(0, 10, CONFIG.MAX_DT_MS, 0));
  });
  it('never exceeds 100', () => {
    expect(tickPsychosis(99.999, 1000, 50, 0)).toBe(100);
    expect(psyOnKill(99.5, 0)).toBe(100);
  });
  it('resist 0.5 halves the rise', () => {
    expect(tickPsychosis(0, 10, 50, 0.5)).toBeCloseTo(tickPsychosis(0, 10, 50, 0) / 2);
    expect(psyOnKill(0, 0.5)).toBeCloseTo(CONFIG.PSY_PER_KILL / 2);
  });
  it('blocker never goes below 0', () => {
    expect(applyBlocker(10, 30)).toBe(0);
    expect(applyBlocker(80, 30)).toBe(50);
  });
  it('drain and crisis multipliers per tier', () => {
    expect(hpDrainPerSec('stable')).toBe(0);
    expect(hpDrainPerSec('glitch')).toBe(0);
    expect(hpDrainPerSec('drain')).toBe(CONFIG.PSY_DRAIN_SLOW);
    expect(hpDrainPerSec('crisis')).toBe(CONFIG.PSY_DRAIN_FAST);
    expect(crisisMultipliers('drain')).toEqual({ damage: 1, speed: 1 });
    expect(crisisMultipliers('crisis')).toEqual({ damage: CONFIG.CRISIS_DAMAGE_MULT, speed: CONFIG.CRISIS_SPEED_MULT });
  });
});
