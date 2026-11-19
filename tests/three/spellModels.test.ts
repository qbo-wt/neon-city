import { describe, it, expect } from 'vitest';
import { SPELLS } from '../../src/data/spells';
import { SPELL_SPECS, buildSpellModel } from '../../src/three/spellModels';

describe('spell models', () => {
  it('has a model spec for every spell id, and none for unknown ids', () => {
    for (const id of Object.keys(SPELLS)) expect(SPELL_SPECS[id], id).toBeDefined();
    for (const id of Object.keys(SPELL_SPECS)) expect(SPELLS[id], id).toBeDefined();
  });

  it('builds a non-empty model for each spell, and a distinct look (shape, detail, colour) per spell', () => {
    const seen = new Map<string, string>();
    for (const id of Object.keys(SPELLS)) {
      expect(buildSpellModel(id)!.children[0].children.length, id).toBeGreaterThan(2);
      const k = `${SPELL_SPECS[id].shape}/${SPELL_SPECS[id].detail}/${SPELLS[id].color}`;
      expect(seen.get(k), `${id} duplicates ${seen.get(k)}`).toBeUndefined();
      seen.set(k, id);
    }
    expect(buildSpellModel('nope')).toBeNull();
  });
});
