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
  it('rises by the base rate even with no implants (the city wears you down)', () => {
    expect(tickPsychosis(10, 0, 50, 0)).toBeCloseTo(10 + CONFIG.PSY_BASE_RATE * 0.05);
    expect(CONFIG.PSY_BASE_RATE).toBeGreaterThan(0);
  });
  it('rises by (base + load * rate) * dtSec', () => {
    expect(tickPsychosis(0, 10, 50, 0)).toBeCloseTo((CONFIG.PSY_BASE_RATE + 10 * CONFIG.PSY_RATE_PER_LOAD) * 0.05);
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
  it('a rate multiplier scales the passive rise (black-market leaks, notoriety)', () => {
    expect(tickPsychosis(0, 10, 50, 0, 1.5)).toBeCloseTo(tickPsychosis(0, 10, 50, 0) * 1.5);
  });
  it('higher tiers hit harder: risk and reward', () => {
    const d = (t: Parameters<typeof crisisMultipliers>[0]) => crisisMultipliers(t).damage;
    expect(d('stable')).toBeLessThan(d('glitch'));
    expect(d('glitch')).toBeLessThan(d('drain'));
    expect(d('drain')).toBeLessThan(d('crisis'));
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
    expect(crisisMultipliers('stable')).toEqual({ damage: 1, speed: 1 });
    expect(crisisMultipliers('glitch')).toEqual({ damage: CONFIG.PSY_GLITCH_DAMAGE, speed: 1 });
    expect(crisisMultipliers('drain')).toEqual({ damage: CONFIG.PSY_DRAIN_DAMAGE, speed: CONFIG.PSY_DRAIN_SPEED });
    expect(crisisMultipliers('crisis')).toEqual({ damage: CONFIG.CRISIS_DAMAGE_MULT, speed: CONFIG.CRISIS_SPEED_MULT });
  });
});
