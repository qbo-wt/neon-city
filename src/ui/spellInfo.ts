import Phaser from 'phaser';
import type { Pt, SpellDef } from '../tactics/types';

/** The area a spell hits, in words. */
export function zoneLabel(s: SpellDef): string {
  const z = s.zone, self = s.target === 'self';
  if (z.shape === 'cell') return self ? 'sur toi' : 'une seule case';
  if (z.shape === 'cross') return `${self ? 'autour de toi, ' : ''}croix de ${z.r} case${z.r > 1 ? 's' : ''}`;
  if (z.shape === 'circle') return `${self ? 'autour de toi, ' : ''}cercle de rayon ${z.r}`;
  if (z.shape === 'line') return `ligne de ${z.len} cases derrière la cible`;
  return `barre de ${z.r * 2 + 1} cases en travers`;
}

/** Cost, range, sight, line, cooldown and casts per turn, in one line. */
export function spellBits(s: SpellDef, range: [number, number] = s.range): string {
  const [min, max] = range;
  const bits = [`${s.pa} PA`, s.target === 'self' ? 'sur soi' : `portée ${min === max ? min : `${min}-${max}`}${s.rangeMod ? ' (modifiable)' : ''}`];
  if (s.target !== 'self') bits.push(s.los ? 'ligne de vue' : 'sans ligne de vue');
  if (s.line) bits.push('en ligne');
  if (s.cooldown) bits.push(`relance ${s.cooldown} tour${s.cooldown > 1 ? 's' : ''}`);
  if (s.perTurn) bits.push(`${s.perTurn}x par tour`);
  return bits.join(' · ');
}

/** Cells of the zone relative to the target, with the caster west of it (for lines). */
function relZone(s: SpellDef): Pt[] {
  const z = s.zone, out: Pt[] = [];
  if (z.shape === 'cell') return [{ x: 0, y: 0 }];
  if (z.shape === 'cross' || z.shape === 'circle') {
    for (let dy = -z.r; dy <= z.r; dy++) for (let dx = -z.r; dx <= z.r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > z.r || (z.shape === 'cross' && dx && dy)) continue;
      out.push({ x: dx, y: dy });
    }
    return out;
  }
  if (z.shape === 'line') { for (let i = 0; i < z.len; i++) out.push({ x: i, y: 0 }); return out; }
  for (let i = -z.r; i <= z.r; i++) out.push({ x: 0, y: i });
  return out;
}

/**
 * A small isometric picture of the zone: red cells are hit, the bright one is where you aim,
 * cyan is you (shown for self spells and for zones that depend on where you stand).
 */
export function zoneIcon(scene: Phaser.Scene, x: number, y: number, s: SpellDef, color: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const cells = relZone(s);
  const self = s.target === 'self';
  const caster: Pt | undefined = self ? { x: 0, y: 0 } : s.zone.shape === 'line' || s.zone.shape === 'perp' ? { x: -2, y: 0 } : undefined;
  const all = [...cells, ...(caster ? [caster] : [])];
  const r = Math.max(2, ...all.map(c => Math.abs(c.x) + Math.abs(c.y)));
  const W = 5, H = 2.5;
  const at = (c: Pt) => ({ x: x + (c.x - c.y) * W, y: y + (c.x + c.y) * H });
  const dia = (c: Pt, fill: number, a: number) => {
    const p = at(c);
    g.fillStyle(fill, a).fillPoints([new Phaser.Math.Vector2(p.x, p.y - H + 0.5), new Phaser.Math.Vector2(p.x + W - 0.5, p.y), new Phaser.Math.Vector2(p.x, p.y + H - 0.5), new Phaser.Math.Vector2(p.x - W + 0.5, p.y)], true);
  };
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r) dia({ x: dx, y: dy }, 0x3a3550, 0.6);
  for (const c of cells) dia(c, color, 0.85);
  if (!self) dia({ x: 0, y: 0 }, 0xffffff, 0.9);
  if (caster) dia(caster, 0x00f0ff, 1);
  return g;
}
