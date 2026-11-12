import Phaser from 'phaser';
import { CONFIG } from '../config';
import { TITLE_FONT } from '../ui/text';
import type { World3D } from '../three/World3D';

export type ImpactKind = 'hit' | 'crit' | 'kill' | 'boss' | 'blast' | 'hurt';

/** How hard each kind of impact lands: 3D screen effect strength, lines, word, shake. */
const KINDS: Record<ImpactKind, { strength: number; lines: number; words: string[]; color: string; size: number }> = {
  hit: { strength: 0.25, lines: 0, words: [], color: '#ffffff', size: 0 },
  hurt: { strength: 0.35, lines: 0, words: [], color: '#ff2a6d', size: 0 },
  crit: { strength: 0.75, lines: 30, words: ['CRITIQUE !', 'BAM !', 'CRAC !'], color: '#f5e663', size: 30 },
  kill: { strength: 0.8, lines: 26, words: ['K.O. !', 'ÉLIMINÉ', 'VLAN !'], color: '#ff2a6d', size: 30 },
  boss: { strength: 1, lines: 40, words: ['ÉLIMINÉ !'], color: '#ff2a6d', size: 40 },
  blast: { strength: 0.6, lines: 20, words: ['BOUM !'], color: '#ff8c2a', size: 32 },
};

/**
 * Anime combat juice over the 3D street: the World3D part (one negative frame, white flash,
 * colour split from the impact, camera shake) plus a Phaser overlay (speed lines converging on the
 * impact, a punchy impact word). Everything lasts a fraction of a second and leaves a clear hole
 * around the impact, so the board stays readable.
 */
export class AnimeFx {
  /** Small hits in quick succession only shake once in a while. */
  private lastWord = 0;

  constructor(private scene: Phaser.Scene, private world: World3D) {}

  /** An impact at (x, y) in Phaser world units (the scene's 480 x 270 space). */
  hit(x: number, y: number, kind: ImpactKind, tint?: number) {
    const k = KINDS[kind];
    this.world.impact(k.strength, x / CONFIG.WIDTH, y / CONFIG.HEIGHT, kind === 'hurt' ? 0xff2a6d : 0xffffff);
    if (k.lines) this.speedLines(x, y, k.lines, tint);
    const now = this.scene.time.now;
    if (k.words.length && now - this.lastWord > 250) {
      this.lastWord = now;
      this.word(x, y, Phaser.Utils.Array.GetRandom(k.words), k.color, k.size);
    }
  }

  /** Wedges from the screen edges toward the impact, quickly gone. */
  private speedLines(x: number, y: number, n: number, tint = 0xffffff) {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const g = this.scene.add.graphics().setDepth(955).setBlendMode(Phaser.BlendModes.ADD);
    const far = Math.hypot(W, H);
    const clear = 34 + Math.random() * 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.18;
      const inner = clear + Math.random() * 40;
      const w = 0.012 + Math.random() * 0.02;
      const col = Math.random() < 0.7 ? 0xffffff : tint;
      g.fillStyle(col, 0.22 + Math.random() * 0.3);
      g.beginPath();
      g.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
      g.lineTo(x + Math.cos(a - w) * far, y + Math.sin(a - w) * far);
      g.lineTo(x + Math.cos(a + w) * far, y + Math.sin(a + w) * far);
      g.closePath();
      g.fillPath();
    }
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 220, delay: 60, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
  }

  /** The impact word: big condensed letters, ink outline, a pop then a short drift. */
  private word(x: number, y: number, str: string, color: string, size: number) {
    const t = this.scene.add.text(x + (Math.random() - 0.5) * 20, y - 26, str, {
      fontFamily: TITLE_FONT, fontSize: `${size}px`, color, fontStyle: '600',
      stroke: '#0b0820', strokeThickness: 5, resolution: CONFIG.ZOOM,
      shadow: { offsetX: 2, offsetY: 2, color: '#ff2a6d', blur: 0, fill: true, stroke: true },
    }).setOrigin(0.5).setDepth(960).setAngle((Math.random() - 0.5) * 16).setScale(1.7).setAlpha(0);
    // Keep it on screen.
    t.x = Phaser.Math.Clamp(t.x, t.width / 2 + 4, CONFIG.WIDTH - t.width / 2 - 4);
    t.y = Phaser.Math.Clamp(t.y, 30, CONFIG.HEIGHT - 50);
    this.scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 90, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, y: t.y - 10, alpha: 0, delay: 420, duration: 260, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
  }
}
