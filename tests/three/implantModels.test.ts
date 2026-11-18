import { describe, it, expect } from 'vitest';
import { IMPLANTS } from '../../src/data/implants';
import { SPECS, buildImplantModel } from '../../src/three/implantModels';

describe('implant models', () => {
  it('has a model spec for every implant id, and none for unknown ids', () => {
    for (const i of IMPLANTS) expect(SPECS[i.id], i.id).toBeDefined();
    for (const id of Object.keys(SPECS)) expect(IMPLANTS.some(i => i.id === id), id).toBe(true);
  });

  it('builds a non-empty model for each implant', () => {
    for (const i of IMPLANTS) expect(buildImplantModel(i.id)!.children[0].children.length, i.id).toBeGreaterThan(3);
    expect(buildImplantModel('nope')).toBeNull();
  });
});
