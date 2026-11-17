import { describe, it, expect } from 'vitest';
import { CYBER } from '../../src/three/cyberware';
import { ALL_AVATARS } from '../../src/three/characters';

const NEON = [0x00f0ff, 0xff2a6d, 0xf5e663, 0x39ff88, 0xb84dff, 0xff8c2a, 0xff3b3b];

describe('cyberware', () => {
  it('gives every avatar at least one augmentation', () => {
    for (const a of ALL_AVATARS) expect(CYBER[a]?.length ?? 0, a).toBeGreaterThan(0);
  });
  it('only lights parts with the neon palette of the game', () => {
    for (const [a, parts] of Object.entries(CYBER)) for (const p of parts) expect(NEON, `${a} ${p.kind}`).toContain(p.glow);
  });
  it('never replaces the same arm twice on one character', () => {
    for (const [a, parts] of Object.entries(CYBER)) {
      const arms = parts.filter(p => p.kind === 'arm' || p.kind === 'bracer').map(p => (p as { side: string }).side);
      expect(new Set(arms).size, a).toBe(arms.length);
    }
  });
  it('keeps the hero signature: a mechanical arm and an eye implant', () => {
    const kinds = CYBER.hero.map(p => p.kind);
    expect(kinds).toContain('arm');
    expect(kinds).toContain('eye');
  });
});
