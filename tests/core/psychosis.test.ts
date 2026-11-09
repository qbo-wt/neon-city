import { describe, it, expect } from 'vitest';
import { addPsy, applyBlocker, hpDrainPerTurn, psyDamageMult, psyOnKill, psyOnTurn, psyTier } from '../../src/core/psychosis';
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
  it('rises every turn even with no implants (the city wears you down), more with load', () => {
    expect(psyOnTurn(10, 0, 0)).toBeCloseTo(10 + CONFIG.PSY_PER_TURN);
    expect(CONFIG.PSY_PER_TURN).toBeGreaterThan(0);
    expect(psyOnTurn(0, 50, 0)).toBeCloseTo(CONFIG.PSY_PER_TURN + 50 * CONFIG.PSY_PER_TURN_PER_LOAD);
  });
  it('resistance reduces gains, rate multipliers scale the turn rise, losses are never reduced', () => {
    expect(psyOnTurn(0, 10, 0.5)).toBeCloseTo(psyOnTurn(0, 10, 0) / 2);
    expect(psyOnTurn(0, 10, 0, 1.5)).toBeCloseTo(psyOnTurn(0, 10, 0) * 1.5);
    expect(psyOnKill(0, 0.5)).toBeCloseTo(CONFIG.PSY_PER_KILL / 2);
    expect(addPsy(50, -20, 0.5)).toBe(30);
  });
  it('stays within 0-100', () => {
    expect(psyOnTurn(99.9, 1000, 0)).toBe(100);
    expect(psyOnKill(99.5, 0)).toBe(100);
    expect(applyBlocker(10, 30)).toBe(0);
    expect(applyBlocker(80, 30)).toBe(50);
  });
  it('higher tiers hit harder but drain HP each turn', () => {
    expect(psyDamageMult('stable')).toBe(1);
    expect(psyDamageMult('glitch')).toBeLessThan(psyDamageMult('drain'));
    expect(psyDamageMult('drain')).toBeLessThan(psyDamageMult('crisis'));
    expect(hpDrainPerTurn('glitch')).toBe(0);
    expect(hpDrainPerTurn('drain')).toBe(CONFIG.PSY_DRAIN_SLOW);
    expect(hpDrainPerTurn('crisis')).toBe(CONFIG.PSY_DRAIN_FAST);
  });
});
