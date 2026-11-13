/**
 * Sound effects are synthesised with WebAudio: short layered voices (oscillators / noise with pitch
 * and filter sweeps), no audio files. The music is recorded tracks (public/assets/music) streamed
 * through the same AudioContext, crossfaded when the mode changes (hub, street fight, boss).
 *
 * Browsers only allow audio after a user gesture: the context is created on the first click / key.
 */

type Wave = OscillatorType | 'noise';
interface Voice {
  wave: Wave; f0: number; f1?: number; dur: number; vol: number;
  attack?: number; delay?: number;
  filter?: { type: BiquadFilterType; f0: number; f1?: number; q?: number };
  /** vibrato depth in Hz (at 18 Hz) */
  vib?: number;
}

export type SfxId =
  | 'swing' | 'swingHeavy' | 'hit' | 'crit' | 'kill' | 'parry' | 'whiff' | 'dash' | 'hurt'
  | 'enemyShoot' | 'playerShoot' | 'hack' | 'explode' | 'credit' | 'heal' | 'implant' | 'door'
  | 'blocker' | 'spawn' | 'stun' | 'bossRoar' | 'quake' | 'nova' | 'charge' | 'windup' | 'ui' | 'uiOpen'
  | 'break' | 'glitch' | 'special' | 'elite' | 'relic' | 'buy' | 'deny' | 'talk';

const SFX: Record<SfxId, Voice[]> = {
  swing: [{ wave: 'noise', f0: 0, dur: 0.09, vol: 0.22, filter: { type: 'bandpass', f0: 2400, f1: 700, q: 1.2 } }, { wave: 'sine', f0: 320, f1: 120, dur: 0.06, vol: 0.06 }],
  swingHeavy: [{ wave: 'noise', f0: 0, dur: 0.18, vol: 0.32, filter: { type: 'lowpass', f0: 1100, f1: 180 } }, { wave: 'sine', f0: 140, f1: 50, dur: 0.15, vol: 0.12 }],
  hit: [{ wave: 'square', f0: 240, f1: 80, dur: 0.07, vol: 0.13 }, { wave: 'noise', f0: 0, dur: 0.06, vol: 0.28, filter: { type: 'lowpass', f0: 3500, f1: 500 } }],
  crit: [{ wave: 'square', f0: 260, f1: 70, dur: 0.09, vol: 0.15 }, { wave: 'noise', f0: 0, dur: 0.08, vol: 0.3, filter: { type: 'lowpass', f0: 5000, f1: 600 } }, { wave: 'triangle', f0: 1320, f1: 1760, dur: 0.1, vol: 0.09, delay: 0.01 }],
  kill: [{ wave: 'noise', f0: 0, dur: 0.28, vol: 0.3, filter: { type: 'lowpass', f0: 1600, f1: 90 } }, { wave: 'sawtooth', f0: 180, f1: 40, dur: 0.22, vol: 0.1, filter: { type: 'lowpass', f0: 1200 } }],
  parry: [{ wave: 'triangle', f0: 1568, dur: 0.35, vol: 0.18 }, { wave: 'sine', f0: 2349, dur: 0.4, vol: 0.09, delay: 0.005 }, { wave: 'noise', f0: 0, dur: 0.05, vol: 0.2, filter: { type: 'highpass', f0: 5000 } }, { wave: 'sine', f0: 200, f1: 60, dur: 0.18, vol: 0.18 }],
  whiff: [{ wave: 'sine', f0: 420, f1: 240, dur: 0.1, vol: 0.06 }],
  dash: [{ wave: 'noise', f0: 0, dur: 0.15, vol: 0.18, filter: { type: 'bandpass', f0: 400, f1: 2800, q: 0.8 } }],
  hurt: [{ wave: 'sawtooth', f0: 320, f1: 70, dur: 0.2, vol: 0.16, filter: { type: 'lowpass', f0: 2000 } }, { wave: 'noise', f0: 0, dur: 0.1, vol: 0.2, filter: { type: 'lowpass', f0: 1800 } }],
  enemyShoot: [{ wave: 'square', f0: 900, f1: 260, dur: 0.07, vol: 0.06 }, { wave: 'noise', f0: 0, dur: 0.04, vol: 0.08, filter: { type: 'highpass', f0: 2000 } }],
  playerShoot: [{ wave: 'square', f0: 1300, f1: 180, dur: 0.08, vol: 0.09 }, { wave: 'noise', f0: 0, dur: 0.06, vol: 0.18, filter: { type: 'bandpass', f0: 2500, q: 0.7 } }],
  hack: [{ wave: 'sine', f0: 500, f1: 1400, dur: 0.3, vol: 0.08, vib: 40 }, { wave: 'square', f0: 1800, dur: 0.05, vol: 0.03, delay: 0.1 }],
  explode: [{ wave: 'noise', f0: 0, dur: 0.7, vol: 0.45, filter: { type: 'lowpass', f0: 2400, f1: 60 } }, { wave: 'sine', f0: 110, f1: 28, dur: 0.6, vol: 0.4 }],
  credit: [{ wave: 'square', f0: 1319, dur: 0.05, vol: 0.05 }, { wave: 'square', f0: 1760, dur: 0.08, vol: 0.05, delay: 0.05 }],
  heal: [{ wave: 'triangle', f0: 660, f1: 990, dur: 0.2, vol: 0.09 }, { wave: 'triangle', f0: 1320, dur: 0.18, vol: 0.06, delay: 0.1 }],
  implant: [523, 659, 784, 1047, 1319].map((f, i) => ({ wave: 'triangle' as Wave, f0: f, dur: 0.16, vol: 0.08, delay: i * 0.055 })),
  relic: [440, 554, 659, 880, 1109, 1319].map((f, i) => ({ wave: 'sawtooth' as Wave, f0: f, dur: 0.25, vol: 0.05, delay: i * 0.07, filter: { type: 'lowpass' as BiquadFilterType, f0: 3000 } })),
  door: [{ wave: 'sawtooth', f0: 180, f1: 420, dur: 0.22, vol: 0.08, filter: { type: 'lowpass', f0: 1400 } }, { wave: 'noise', f0: 0, dur: 0.2, vol: 0.06, filter: { type: 'bandpass', f0: 800, f1: 3000 } }],
  blocker: [{ wave: 'sine', f0: 1100, f1: 300, dur: 0.32, vol: 0.1 }, { wave: 'noise', f0: 0, dur: 0.25, vol: 0.06, filter: { type: 'highpass', f0: 4000 } }],
  spawn: [{ wave: 'sawtooth', f0: 70, f1: 320, dur: 0.28, vol: 0.06, filter: { type: 'lowpass', f0: 900 } }],
  stun: [{ wave: 'triangle', f0: 1400, f1: 700, dur: 0.25, vol: 0.07, vib: 60 }],
  bossRoar: [{ wave: 'sawtooth', f0: 130, f1: 55, dur: 1.1, vol: 0.28, attack: 0.08, filter: { type: 'lowpass', f0: 900, f1: 300 }, vib: 6 }, { wave: 'noise', f0: 0, dur: 0.9, vol: 0.25, attack: 0.1, filter: { type: 'lowpass', f0: 500 } }, { wave: 'square', f0: 65, dur: 1, vol: 0.06, attack: 0.1 }],
  quake: [{ wave: 'sine', f0: 80, f1: 26, dur: 0.7, vol: 0.5 }, { wave: 'noise', f0: 0, dur: 0.6, vol: 0.4, filter: { type: 'lowpass', f0: 500, f1: 80 } }],
  nova: [{ wave: 'sine', f0: 260, f1: 1300, dur: 0.45, vol: 0.12 }, { wave: 'noise', f0: 0, dur: 0.35, vol: 0.12, filter: { type: 'bandpass', f0: 600, f1: 4000 } }],
  charge: [{ wave: 'noise', f0: 0, dur: 0.45, vol: 0.2, filter: { type: 'bandpass', f0: 300, f1: 1400, q: 1 } }, { wave: 'sawtooth', f0: 90, f1: 140, dur: 0.4, vol: 0.06, filter: { type: 'lowpass', f0: 600 } }],
  windup: [{ wave: 'sawtooth', f0: 220, f1: 660, dur: 0.22, vol: 0.05, filter: { type: 'lowpass', f0: 2000 } }],
  ui: [{ wave: 'square', f0: 880, dur: 0.03, vol: 0.04 }],
  uiOpen: [{ wave: 'triangle', f0: 400, f1: 900, dur: 0.1, vol: 0.06 }, { wave: 'square', f0: 1800, dur: 0.03, vol: 0.02, delay: 0.08 }],
  break: [{ wave: 'noise', f0: 0, dur: 0.18, vol: 0.25, filter: { type: 'lowpass', f0: 1800, f1: 200 } }, { wave: 'square', f0: 160, f1: 60, dur: 0.09, vol: 0.06 }],
  glitch: [{ wave: 'square', f0: 300, f1: 2200, dur: 0.05, vol: 0.03 }, { wave: 'square', f0: 1900, f1: 200, dur: 0.04, vol: 0.025, delay: 0.05 }],
  special: [{ wave: 'sawtooth', f0: 120, f1: 900, dur: 0.25, vol: 0.1, filter: { type: 'lowpass', f0: 3000 } }, { wave: 'noise', f0: 0, dur: 0.3, vol: 0.2, filter: { type: 'bandpass', f0: 500, f1: 3000 } }],
  elite: [0, 0.25, 0.5].map(d => ({ wave: 'square' as Wave, f0: 880, f1: 660, dur: 0.18, vol: 0.05, delay: d })),
  buy: [{ wave: 'square', f0: 988, dur: 0.06, vol: 0.05 }, { wave: 'square', f0: 1319, dur: 0.12, vol: 0.05, delay: 0.06 }],
  deny: [{ wave: 'square', f0: 180, dur: 0.12, vol: 0.06 }, { wave: 'square', f0: 140, dur: 0.14, vol: 0.06, delay: 0.1 }],
  talk: [{ wave: 'square', f0: 600, f1: 500, dur: 0.04, vol: 0.025 }, { wave: 'square', f0: 700, f1: 620, dur: 0.04, vol: 0.02, delay: 0.06 }],
};

export type MusicMode = 'off' | 'hub' | 'run' | 'boss';

interface Track { file: string; /** level trim, 1 = as mastered */ vol: number }

/**
 * Recorded tracks in public/assets/music (all CC0, see CREDITS.md). A mode with several tracks plays
 * them one after the other; a mode with a single track loops it.
 */
const TRACKS: Record<Exclude<MusicMode, 'off'>, Track[]> = {
  hub: [{ file: 'hub-space-city.ogg', vol: 1 }, { file: 'hub-dark-city.mp3', vol: 1 }],
  run: [{ file: 'run-cyberpunk-moonlight-sonata.mp3', vol: 1 }, { file: 'run-night-prowler.ogg', vol: 1 }],
  boss: [{ file: 'boss-the-9th-circle.mp3', vol: 1 }],
};
const MUSIC_DIR = 'assets/music/';
/** Crossfade between modes, in seconds. */
const FADE = 1;

/** One track: a streaming <audio> element routed into the AudioContext through its own fader. */
interface Deck { el: HTMLAudioElement; gain: GainNode; vol: number; stop?: ReturnType<typeof setTimeout> }

/** Plays the recorded tracks with crossfades; intensity opens a low-pass filter on the run music. */
class Music {
  private filter: BiquadFilterNode;
  private lift: GainNode;
  private decks = new Map<string, Deck>();
  private lists: Record<Exclude<MusicMode, 'off'>, Track[]>;
  private index = { hub: 0, run: 0, boss: 0 };
  private current?: Deck;
  mode: MusicMode = 'off';
  private intensity = 1;

  constructor(private ctx: AudioContext, out: AudioNode) {
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass'; this.filter.Q.value = 0.5; this.filter.frequency.value = 20000;
    this.lift = ctx.createGain();
    this.filter.connect(this.lift).connect(out);
    // Drop the formats this browser cannot decode (older Safari has no Ogg Vorbis).
    const probe = document.createElement('audio');
    const ok = (t: Track) => probe.canPlayType(t.file.endsWith('.ogg') ? 'audio/ogg; codecs="vorbis"' : 'audio/mpeg') !== '';
    this.lists = { hub: TRACKS.hub.filter(ok), run: TRACKS.run.filter(ok), boss: TRACKS.boss.filter(ok) };
  }

  setMode(mode: MusicMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.switchTo(mode === 'off' ? undefined : this.pick(mode), FADE);
    this.applyIntensity(FADE / 3);
  }

  /** 0 = calm (cleared street), 1 = full fight. */
  setIntensity(v: number) {
    if (Math.abs(v - this.intensity) < 0.01) return;
    this.intensity = v;
    this.applyIntensity(0.4);
  }

  /** Called on every user gesture: retries a play() the browser refused before the first one. */
  resume() {
    const d = this.current;
    if (d && d.el.paused) void d.el.play().catch(() => { /* still blocked: next gesture retries */ });
  }

  private applyIntensity(tc: number) {
    // Only the street fights react; hub and boss always play wide open.
    const i = this.mode === 'run' ? Math.min(1, Math.max(0, this.intensity)) : 1;
    const t = this.ctx.currentTime;
    this.filter.frequency.setTargetAtTime(3000 * Math.pow(20000 / 3000, i), t, tc);
    this.lift.gain.setTargetAtTime(0.82 + 0.18 * i, t, tc);
  }

  private pick(mode: Exclude<MusicMode, 'off'>): Deck | undefined {
    const list = this.lists[mode];
    return list.length ? this.deck(list[this.index[mode] % list.length], list.length === 1) : undefined;
  }

  private deck(track: Track, loop: boolean): Deck {
    let d = this.decks.get(track.file);
    if (d) return d;
    const el = new Audio(MUSIC_DIR + track.file);
    el.preload = 'auto'; el.loop = loop;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    this.ctx.createMediaElementSource(el).connect(gain).connect(this.filter);
    d = { el, gain, vol: track.vol };
    const deck = d;
    el.addEventListener('ended', () => this.onEnded(deck));
    this.decks.set(track.file, d);
    return d;
  }

  /** End of a track in a playlist: the next one takes over. */
  private onEnded(d: Deck) {
    if (d !== this.current || this.mode === 'off') return;
    this.index[this.mode]++;
    this.switchTo(this.pick(this.mode), 0.05);
  }

  private switchTo(next: Deck | undefined, sec: number) {
    const prev = this.current;
    this.current = next;
    if (prev && prev !== next) this.fade(prev, 0, sec);
    if (next) {
      if (next.el.ended) next.el.currentTime = 0;
      this.fade(next, next.vol, sec);
      this.resume();
    }
  }

  private fade(d: Deck, to: number, sec: number) {
    const t = this.ctx.currentTime, g = d.gain.gain;
    clearTimeout(d.stop);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + sec);
    // Faded out: pause it (keeps its position, so the hub picks up where it left off).
    if (to === 0) d.stop = setTimeout(() => { if (d !== this.current) d.el.pause(); }, sec * 1000 + 100);
  }
}

class AudioEngine {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sfxBus?: GainNode;
  private noise?: AudioBuffer;
  private music?: Music;
  private last = new Map<SfxId, number>();
  private pendingMode: MusicMode = 'off';
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem('neon-city-muted') === '1'; } catch { /* storage blocked */ }
    if (typeof window !== 'undefined') {
      const unlock = () => this.unlock();
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
      window.addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat) this.toggleMute(); });
    }
  }

  /** Creates (or resumes) the audio context; must run inside a user gesture. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      // Gentle limiter so stacked hits never clip.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      const musicBus = this.ctx.createGain();
      // Recorded tracks are mastered loud: keep them under the effects.
      musicBus.gain.value = 0.35;
      musicBus.connect(this.master);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.music = new Music(this.ctx, musicBus);
      this.music.setMode(this.pendingMode);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.music?.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('neon-city-muted', this.muted ? '1' : '0'); } catch { /* storage blocked */ }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  setMusic(mode: MusicMode) {
    this.pendingMode = mode;
    this.music?.setMode(mode);
  }

  setIntensity(v: number) { this.music?.setIntensity(v); }

  /** Plays a sound effect; the same effect is throttled so a crowd does not turn into noise. */
  sfx(id: SfxId, opts: { pitch?: number; vol?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noise || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.last.get(id) ?? -1) < 0.035) return;
    this.last.set(id, now);
    const pitch = (opts.pitch ?? 1) * (0.95 + Math.random() * 0.1), vol = opts.vol ?? 1;
    for (const v of SFX[id]) this.voice(v, now + (v.delay ?? 0), pitch, vol);
  }

  private voice(v: Voice, t: number, pitch: number, vol: number) {
    const ctx = this.ctx!, g = ctx.createGain();
    let src: AudioScheduledSourceNode;
    if (v.wave === 'noise') {
      const s = ctx.createBufferSource();
      s.buffer = this.noise!;
      src = s;
    } else {
      const o = ctx.createOscillator();
      o.type = v.wave;
      o.frequency.setValueAtTime(v.f0 * pitch, t);
      if (v.f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, v.f1 * pitch), t + v.dur);
      if (v.vib) {
        const lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = 18; depth.gain.value = v.vib;
        lfo.connect(depth).connect(o.frequency); lfo.start(t); lfo.stop(t + v.dur + 0.05);
      }
      src = o;
    }
    let node: AudioNode = src;
    if (v.filter) {
      const f = ctx.createBiquadFilter();
      f.type = v.filter.type; f.Q.value = v.filter.q ?? 0.7;
      f.frequency.setValueAtTime(v.filter.f0, t);
      if (v.filter.f1) f.frequency.exponentialRampToValueAtTime(v.filter.f1, t + v.dur);
      node.connect(f); node = f;
    }
    const a = v.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v.vol * vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + v.dur);
    node.connect(g).connect(this.sfxBus!);
    if (v.wave === 'noise') (src as AudioBufferSourceNode).start(t, Math.random() * 0.5, v.dur + 0.05);
    else { src.start(t); src.stop(t + v.dur + 0.05); }
  }
}

export const audio = new AudioEngine();
