import Phaser from 'phaser';
import { createRng, pick, type Rng } from '../core/rng';
import { TILE } from '../core/runMap';
import type { RoomTemplate } from '../data/rooms';
import type { StreetStyle } from './streetArt';
import { txt } from '../ui/text';

/**
 * The city around the street, painted top-down in 3/4 view:
 * - wall tiles with street below = building fronts (upper floor, sign band, shop front, awning),
 * - every other built tile = rooftops (gravel, AC units, vents, skylights, tanks, solar, antennas, gardens),
 * - shadows cast on the street and light spilling from the shop windows.
 */

interface Shop { name: string; color: string; window: string; goods: Goods; awning?: [string, string]; shutter?: boolean; lanterns?: boolean }
type Goods = 'bowls' | 'bottles' | 'screens' | 'crosses' | 'shelves' | 'art' | 'none' | 'guns' | 'machines';

const SHOPS: Shop[] = [
  { name: 'RAMEN', color: '#ff3b3b', window: '#ffb070', goods: 'bowls', awning: ['#ff3b3b', '#e8e8ff'], lanterns: true },
  { name: 'BAR', color: '#b44cff', window: '#7a2cff', goods: 'bottles' },
  { name: 'PRÊTEUR', color: '#f5e663', window: '#f5e663', goods: 'none', shutter: true },
  { name: 'ARCADE', color: '#00f0ff', window: '#2a6aff', goods: 'screens' },
  { name: 'PHARMA', color: '#39ff88', window: '#c8ffe0', goods: 'crosses' },
  { name: 'TATOUAGE', color: '#ff2a6d', window: '#ff6a9d', goods: 'art' },
  { name: 'HÔTEL', color: '#ffd27a', window: '#ffd27a', goods: 'none' },
  { name: 'SUSHI', color: '#ff8c2a', window: '#ffc890', goods: 'bowls', awning: ['#ff8c2a', '#2a1a10'] },
  { name: 'KARAOKÉ', color: '#ff2a6d', window: '#b44cff', goods: 'screens' },
  { name: '24/7', color: '#39ff88', window: '#e8ffe8', goods: 'shelves', awning: ['#39ff88', '#0b3a20'] },
  { name: 'CLUB', color: '#b44cff', window: '#ff2a6d', goods: 'none' },
  { name: 'CYBER-CAFÉ', color: '#00f0ff', window: '#9ae8ff', goods: 'screens' },
  { name: 'ARMURERIE', color: '#ff3b3b', window: '#ff9a7a', goods: 'guns', shutter: true },
  { name: 'LAVERIE', color: '#9ae8ff', window: '#e8f8ff', goods: 'machines', awning: ['#00a0b0', '#e8e8ff'] },
  { name: 'NOODLES', color: '#f5e663', window: '#ffd27a', goods: 'bowls', awning: ['#f5e663', '#8a1038'], lanterns: true },
  { name: 'MOTEL', color: '#ff2a6d', window: '#ffb0c8', goods: 'none' },
];
const STYLE_SHOPS: Partial<Record<StreetStyle, Shop[]>> = {
  checkpoint: [{ name: 'PSY-SEC', color: '#ff3b3b', window: '#ff5050', goods: 'none', shutter: true }, { name: 'ZONE FERMÉE', color: '#f5e663', window: '#3a3550', goods: 'none', shutter: true }],
  docks: [{ name: 'ENTREPÔT 7', color: '#f5e663', window: '#3a3a48', goods: 'none', shutter: true }, { name: 'FRET', color: '#00f0ff', window: '#3a3a48', goods: 'none', shutter: true }, ...SHOPS.slice(1, 2)],
  parking: [{ name: 'SORTIE', color: '#39ff88', window: '#1a2a1a', goods: 'none' }, { name: 'NIVEAU -1', color: '#f5e663', window: '#2a2a3a', goods: 'none', shutter: true }],
};

const ROOFS = ['#1c1830', '#221a2e', '#18202a', '#2a1e24', '#1e1e26', '#241c34'];
const WALLS = ['#3a3058', '#2e2a48', '#3a2a40', '#2a3448', '#40303a'];
const WINDOW_LIGHTS = ['#f5e663', '#ffd27a', '#00f0ff', '#ff2a6d', '#9ae8ff', '#0f0a1e', '#0f0a1e', '#0f0a1e'];

export interface CityPaint {
  /** Shop signs to render as crisp neon text: centre x, y, name, colour. */
  signs: { x: number; y: number; name: string; color: string; width: number }[];
  /** Spots for blinking antenna lights and window glows. */
  antennas: { x: number; y: number }[];
  /** Where shop windows light the pavement. */
  spills: { x: number; y: number; color: string; w: number }[];
}

export function paintCity(scene: Phaser.Scene, key: string, template: RoomTemplate, style: StreetStyle, seed: number): CityPaint {
  const rng = createRng(seed);
  const g = template.grid, rows = g.length, cols = g[0].length;
  const W = cols * TILE, H = rows * TILE;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const t = scene.textures.createCanvas(key, W, H)!;
  const ctx = t.getContext();
  const f = (c: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const at = (x: number, y: number) => (y < 0 || y >= rows || x < 0 || x >= cols ? ' ' : g[y][x]);
  const isFloor = (x: number, y: number) => { const c = at(x, y); return c === '.' || c === 'P' || c === 'o'; };
  const built = (x: number, y: number) => !isFloor(x, y);
  const isFacade = (x: number, y: number) => built(x, y) && isFloor(x, y + 1) && at(x, y) !== ' ';
  // Building blocks: irregular rows of buildings (3-5 tiles tall, 2-6 wide) so the skyline never reads as a grid.
  const bandOf: number[] = [], cutsOf: number[][] = [];
  for (let y = 0, band = 0; y < rows; band++) {
    const h = 3 + Math.floor(rng() * 3);
    const cuts: number[] = [];
    for (let x = 0; x < cols; x += 2 + Math.floor(rng() * 5)) cuts.push(x);
    for (let k = 0; k < h && y < rows; k++, y++) { bandOf[y] = band; cutsOf[y] = cuts; }
  }
  const blockOf = (x: number, y: number) => {
    const yy = Math.max(0, Math.min(rows - 1, y)), cuts = cutsOf[yy];
    let seg = 0;
    while (seg + 1 < cuts.length && cuts[seg + 1] <= x) seg++;
    return bandOf[yy] * 97 + seg;
  };
  const hash = (n: number) => { const r = createRng(n * 7919 + seed); return r(); };
  const roofColor = (x: number, y: number) => ROOFS[Math.floor(hash(blockOf(x, y)) * ROOFS.length)];
  const wallColor = (x: number, y: number) => WALLS[Math.floor(hash(blockOf(x, y) + 3) * WALLS.length)];

  const out: CityPaint = { signs: [], antennas: [], spills: [] };

  // ---------- rooftops ----------
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    if (!built(tx, ty) || isFacade(tx, ty)) continue;
    const x = tx * TILE, y = ty * TILE;
    const far = at(tx, ty) === ' ';
    f(roofColor(tx, ty), x, y, TILE, TILE);
    for (let i = 0; i < 14; i++) f(rng() < 0.5 ? '#0000001f' : '#ffffff0d', x + rng() * TILE, y + rng() * TILE, 1 + rng() * 2, 1);
    // Parapets: lighter rim where the roof meets the street or another block.
    const rim = '#4a4068', seam = '#08060f';
    if (isFloor(tx, ty - 1) || isFacade(tx, ty - 1)) f(rim, x, y, TILE, 2);
    if (isFloor(tx - 1, ty)) { f(rim, x, y, 2, TILE); }
    if (isFloor(tx + 1, ty)) { f(rim, x + TILE - 2, y, 2, TILE); }
    if (blockOf(tx - 1, ty) !== blockOf(tx, ty) && built(tx - 1, ty)) f(seam, x, y, 2, TILE);
    if (blockOf(tx, ty - 1) !== blockOf(tx, ty) && built(tx, ty - 1) && !isFacade(tx, ty - 1)) f(seam, x, y, TILE, 2);
    // Roof furniture.
    const r = rng();
    if (r < 0.12) { // AC unit
      const ax = x + 6 + rng() * 10, ay = y + 6 + rng() * 10;
      f('#05030f', ax, ay, 14, 12); f('#6a6a88', ax + 1, ay + 1, 12, 10); f('#4a4a66', ax + 1, ay + 8, 12, 3);
      ctx.strokeStyle = '#2a2a3c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ax + 7, ay + 5, 3.5, 0, Math.PI * 2); ctx.stroke();
      f('#2a2a3c', ax + 4, ay + 5, 7, 1);
    } else if (r < 0.22) { // vents
      for (let k = 0; k < 2; k++) { const vx = x + 4 + rng() * 22, vy = y + 4 + rng() * 22; f('#05030f', vx, vy, 6, 6); f('#3a3550', vx + 1, vy + 1, 4, 4); f('#8a86b0', vx + 1, vy + 1, 4, 1); }
    } else if (r < 0.29 && !far) { // skylight
      const sx = x + 5 + rng() * 8, sy = y + 8 + rng() * 8, c = pick(rng, ['#ffd27a', '#9ae8ff', '#ff6a9d']);
      f('#05030f', sx - 1, sy - 1, 16, 10); f(c, sx, sy, 14, 8); f('#ffffff55', sx, sy, 14, 2); f('#05030f', sx + 6, sy, 1, 8);
    } else if (r < 0.33) { // water tank
      const cx = x + 16, cy = y + 16;
      ctx.fillStyle = '#05030f'; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3a2f25'; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
    } else if (r < 0.38) { // solar panels
      const px = x + 3, py = y + 6;
      f('#05030f', px, py, 26, 18); f('#1a3a7a', px + 1, py + 1, 24, 16);
      for (let k = 1; k < 4; k++) f('#2a5aaa', px + 1 + k * 6, py + 1, 1, 16);
      f('#2a5aaa', px + 1, py + 9, 24, 1);
    } else if (r < 0.41) { // antenna (light blinks in-game)
      const ax = x + 8 + rng() * 16, ay = y + 8 + rng() * 16;
      ctx.strokeStyle = '#8a86b0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 5, ay + 9); ctx.moveTo(ax, ay); ctx.lineTo(ax + 5, ay + 9); ctx.stroke();
      f('#05030f', ax - 1, ay - 1, 3, 3);
      out.antennas.push({ x: ax, y: ay });
    } else if (r < 0.44 && !far) { // rooftop garden
      for (let k = 0; k < 5; k++) { const gx = x + 4 + rng() * 20, gy = y + 4 + rng() * 20; f('#1d5a36', gx, gy, 6, 6); f('#39ff8866', gx + 1, gy + 1, 3, 2); }
    }
    if (far) f('#0b082055', x, y, TILE, TILE); // distant blocks a little darker
  }

  // ---------- building fronts ----------
  const shops = STYLE_SHOPS[style] ?? SHOPS;
  for (let ty = 0; ty < rows; ty++) {
    let tx = 0;
    while (tx < cols) {
      if (!isFacade(tx, ty)) { tx++; continue; }
      // A run of facade tiles, cut into shops of 2-4 tiles; doors (D) are alley gates of their own.
      let len = 0;
      while (tx + len < cols && isFacade(tx + len, ty) && at(tx + len, ty) !== 'D' && len < 2 + Math.floor(rng() * 3)) len++;
      if (len === 0) { paintGate(tx, ty); tx++; continue; }
      paintShop(tx, ty, len, pick(rng, shops));
      tx += len;
    }
  }

  function paintGate(tx: number, ty: number) {
    const x = tx * TILE, y = ty * TILE;
    // Alley gate between buildings: a rolling shutter (exits draw their own door sprite on top).
    f(wallColor(tx, ty), x, y, TILE, TILE);
    f('#4a4068', x, y, TILE, 2);
    f('#05030f', x + 3, y + 8, 26, 24); f('#4a4a62', x + 4, y + 9, 24, 23);
    for (let k = y + 11; k < y + 32; k += 3) f('#2e2e42', x + 4, k, 24, 1);
    f('#ff3b3b', x + 14, y + 4, 4, 2);
  }

  function paintShop(tx: number, ty: number, len: number, shop: Shop) {
    const x0 = tx * TILE, y = ty * TILE, w = len * TILE;
    const wall = wallColor(tx, ty);
    // Roof edge and upper floor.
    f('#4a4068', x0, y, w, 2); f('#14101f', x0, y + 2, w, 1);
    f(wall, x0, y + 3, w, 12);
    for (let k = 0; k < len * 2; k++) {
      const wx = x0 + 4 + k * 16, lit = pick(rng, WINDOW_LIGHTS);
      f('#05030f', wx - 1, y + 4, 9, 9); f(lit, wx, y + 5, 7, 7);
      if (lit !== '#0f0a1e') { f('#05030f55', wx, y + 7, 7, 1); f('#05030f55', wx, y + 9, 7, 1); } // blinds
      if (rng() < 0.18) { f('#05030f', wx, y + 13, 7, 4); f('#8a8aa8', wx + 1, y + 13, 5, 3); } // AC box under the window
    }
    if (rng() < 0.25) { // fire escape
      ctx.strokeStyle = '#05030f'; ctx.lineWidth = 1;
      const fx = x0 + w - 14;
      ctx.beginPath(); ctx.moveTo(fx, y + 4); ctx.lineTo(fx + 10, y + 14); ctx.moveTo(fx, y + 14); ctx.lineTo(fx + 10, y + 4); ctx.stroke();
      f('#05030f', fx - 2, y + 14, 14, 1);
    }
    // Sign band.
    f('#0b0820', x0, y + 15, w, 5);
    out.signs.push({ x: x0 + w / 2, y: y + 17, name: shop.name, color: shop.color, width: w });
    // Shop front.
    const fy = y + 20, fh = 12;
    f('#05030f', x0, fy, w, fh);
    if (shop.shutter) {
      f('#5a5578', x0 + 2, fy, w - 4, fh);
      for (let k = fy + 2; k < fy + fh; k += 2) f('#3a3550', x0 + 2, k, w - 4, 1);
      if (rng() < 0.7) { // tag on the shutter
        ctx.strokeStyle = pick(rng, ['#ff2a6d', '#00f0ff', '#f5e663', '#39ff88']); ctx.lineWidth = 1.5; ctx.beginPath();
        const gx = x0 + 6 + rng() * (w - 24); ctx.moveTo(gx, fy + 8);
        for (let k = 0; k < 5; k++) ctx.lineTo(gx + k * 4, fy + 4 + (k % 2) * 5);
        ctx.stroke();
      }
    } else {
      // Lit window with goods, and a door.
      const doorAt = x0 + (len > 1 ? w - 14 : w / 2 - 5);
      f(shop.window, x0 + 2, fy + 1, w - 4, fh - 1);
      f('#ffffff22', x0 + 2, fy + 1, w - 4, 2);
      paintGoods(shop.goods, x0 + 3, fy + 4, w - 20, shop.color);
      f('#05030f', doorAt, fy + 1, 10, fh - 1); f(rng() < 0.4 ? shop.window : '#1a1430', doorAt + 1, fy + 2, 8, fh - 2);
      f('#f5e663', doorAt + 7, fy + 7, 1, 2);
      out.spills.push({ x: x0 + w / 2, y: y + TILE + 10, color: shop.window, w });
    }
    // Awning hanging over the pavement.
    if (shop.awning) {
      for (let k = 0; k < w; k += 6) { f(shop.awning[0], x0 + k, fy - 1, 3, 7); f(shop.awning[1], x0 + k + 3, fy - 1, 3, 7); }
      for (let k = 0; k < w; k += 6) { f(shop.awning[0], x0 + k, fy + 6, 3, 2); }
      f('#00000044', x0, y + TILE, w, 4); // shadow on the sidewalk
    }
    if (shop.lanterns) for (let k = 6; k < w; k += 12) { f('#05030f', x0 + k, y + TILE - 1, 1, 3); f('#ff3b3b', x0 + k - 2, y + TILE + 2, 5, 5); f('#ffb070', x0 + k - 1, y + TILE + 3, 3, 2); }
    // Pillars between shops.
    f('#14101f', x0, y + 15, 1, 17); f('#14101f', x0 + w - 1, y + 15, 1, 17);
  }

  function paintGoods(goods: Goods, x: number, y: number, w: number, accent: string) {
    for (let gx = x; gx < x + w - 4; gx += 7) {
      switch (goods) {
        case 'bowls': f('#05030f', gx, y + 3, 5, 3); f('#e8e8ff', gx + 1, y + 3, 3, 1); break;
        case 'bottles': f('#05030f', gx + 1, y, 2, 6); f(pick(rng, ['#39ff88', '#ff8c2a', '#00f0ff']), gx + 1, y + 2, 2, 3); break;
        case 'screens': f('#05030f', gx, y, 6, 5); f(pick(rng, ['#00f0ff', '#ff2a6d', '#39ff88']), gx + 1, y + 1, 4, 3); break;
        case 'crosses': f('#ff3b3b', gx + 2, y, 2, 6); f('#ff3b3b', gx, y + 2, 6, 2); break;
        case 'shelves': f('#05030f', gx, y + 1, 6, 1); f('#05030f', gx, y + 4, 6, 1); f(pick(rng, ['#f5e663', '#ff2a6d', '#00f0ff']), gx + 1, y + 2, 2, 2); break;
        case 'art': f(accent, gx + 1, y, 4, 5); f('#05030f', gx + 2, y + 1, 2, 3); break;
        case 'guns': f('#05030f', gx, y + 2, 6, 2); f('#05030f', gx + 1, y + 4, 2, 2); break;
        case 'machines': ctx.fillStyle = '#05030f'; ctx.beginPath(); ctx.arc(gx + 3, y + 3, 3, 0, Math.PI * 2); ctx.fill(); f('#9ae8ff', gx + 2, y + 2, 2, 2); break;
        default: break;
      }
    }
  }

  // ---------- shadows on the street ----------
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    if (!isFloor(tx, ty)) continue;
    const x = tx * TILE, y = ty * TILE;
    if (built(tx - 1, ty)) { const gr = ctx.createLinearGradient(x, 0, x + 12, 0); gr.addColorStop(0, '#00000066'); gr.addColorStop(1, '#00000000'); ctx.fillStyle = gr; ctx.fillRect(x, y, 12, TILE); }
    if (built(tx, ty - 1) && !isFacade(tx, ty - 1)) { const gr = ctx.createLinearGradient(0, y, 0, y + 10); gr.addColorStop(0, '#00000055'); gr.addColorStop(1, '#00000000'); ctx.fillStyle = gr; ctx.fillRect(x, y, TILE, 10); }
  }
  t.refresh();
  return out;
}

/** Crisp neon shop signs, antenna beacons and light spilling on the pavement. */
export function lightCity(scene: Phaser.Scene, paint: CityPaint) {
  for (const s of paint.signs) {
    const col = Phaser.Display.Color.HexStringToColor(s.color).color;
    const label = txt(scene, s.x, s.y, s.name, s.width > 70 ? 6 : 5, s.color).setOrigin(0.5).setDepth(3).setStroke('#05030f', 2);
    if (label.width > s.width - 4) label.setScale((s.width - 4) / label.width);
    scene.add.image(s.x, s.y, 'glow').setTint(col).setAlpha(0.35).setScale(s.width / 64 * 1.2, 0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(2.9);
    if (Math.random() < 0.25) scene.tweens.add({ targets: label, alpha: 0.25, yoyo: true, repeat: -1, duration: 60, repeatDelay: 1200 + Math.random() * 3500 });
  }
  for (const sp of paint.spills) {
    const col = Phaser.Display.Color.HexStringToColor(sp.color).color;
    scene.add.image(sp.x, sp.y, 'glow').setTint(col).setAlpha(0.22).setScale(sp.w / 64 * 1.1, 0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(1.6);
  }
  for (const a of paint.antennas) {
    const l = scene.add.rectangle(a.x, a.y, 2, 2, 0xff3b3b).setDepth(3);
    scene.tweens.add({ targets: l, alpha: 0.1, yoyo: true, repeat: -1, duration: 500, delay: Math.random() * 1000 });
  }
}

/** Above the player: cables strung between facades, lantern garlands, holo adverts. */
export function overheadCity(scene: Phaser.Scene, template: RoomTemplate, style: StreetStyle, rng: Rng) {
  const W = template.grid[0].length * TILE, H = template.grid.length * TILE;
  const gr = scene.add.graphics().setDepth(36);
  const wires = style === 'alley' ? 7 : style === 'market' ? 6 : style === 'docks' || style === 'parking' ? 2 : 4;
  for (let i = 0; i < wires; i++) {
    const x1 = rng() * W, x2 = x1 + (rng() - 0.5) * 260, sag = 20 + rng() * 40;
    gr.lineStyle(1, 0x05030f, 0.85);
    const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(x1, 0), new Phaser.Math.Vector2((x1 + x2) / 2, H / 2 + sag), new Phaser.Math.Vector2(x2, H));
    curve.draw(gr, 24);
    if (style === 'market' || rng() < 0.3) {
      // Lantern garland along the wire.
      curve.getPoints(10).slice(1, -1).forEach(p => {
        const col = pick(rng, [0xff3b3b, 0xf5e663, 0xff2a6d, 0x00f0ff]);
        scene.add.circle(p.x, p.y + 3, 2.5, col).setDepth(36.5);
        scene.add.image(p.x, p.y + 3, 'glow').setTint(col).setAlpha(0.25).setScale(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(36.4);
      });
    }
  }
  if ((style === 'avenue' || style === 'plaza' || style === 'crossroad') && rng() < 0.8) {
    // Holographic advert floating over the street.
    const msg = pick(rng, ['VIS LA NUIT', 'BIÈRE NEON', 'IMPLANTS -30 %', 'ASSURANCE TRAUMA', 'RÊVE EN CHROME']);
    const holo = txt(scene, W * (0.3 + rng() * 0.4), H * (0.35 + rng() * 0.3), msg, 14, '#00f0ff').setOrigin(0.5).setDepth(35).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: holo, alpha: 0.08, yoyo: true, repeat: -1, duration: 90, repeatDelay: 2200 });
    scene.tweens.add({ targets: holo, y: holo.y - 4, yoyo: true, repeat: -1, duration: 2000, ease: 'Sine.inOut' });
  }
}
