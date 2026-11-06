import { describe, it, expect } from 'vitest';
import { canBuy, buyNode } from '../../src/core/skillTree';
import { SKILL_NODES } from '../../src/data/skillNodes';

const root = SKILL_NODES.find(n => !n.requires)!;
const child = SKILL_NODES.find(n => n.requires === root.id)!;

describe('skill tree', () => {
  it('refuses when not enough credits, without mutating input', () => {
    const owned: string[] = [];
    expect(canBuy(root.id, owned, root.cost - 1)).toBe(false);
    expect(() => buyNode(root.id, owned, root.cost - 1)).toThrow();
    expect(owned).toEqual([]);
  });
  it('refuses when prerequisite missing', () => {
    expect(canBuy(child.id, [], 99999)).toBe(false);
    expect(() => buyNode(child.id, [], 99999)).toThrow();
  });
  it('refuses already owned or unknown nodes', () => {
    expect(canBuy(root.id, [root.id], 99999)).toBe(false);
    expect(canBuy('nope', [], 99999)).toBe(false);
  });
  it('valid purchase deducts cost and adds id', () => {
    const owned: string[] = [];
    const r = buyNode(root.id, owned, root.cost + 7);
    expect(r).toEqual({ owned: [root.id], credits: 7 });
    expect(owned).toEqual([]);
    expect(canBuy(child.id, r.owned, 99999)).toBe(true);
  });
});
