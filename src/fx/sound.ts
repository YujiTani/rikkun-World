import { ANIMAL_SOUNDS } from './animalSounds';
import { COMBAT_SOUNDS } from './combatSounds';
import { LEGEND_SOUNDS } from './legendSounds';
import { FX_SETTINGS, type FxSettings } from './config';
import { CRAFT_SOUNDS } from './craftSounds';
import { FARM_SOUNDS } from './farmSounds';
import { box, hz, mar, noise, sine, tri, WHIFF_TONES, wood, xylo } from './sfxVoices';
import { levelOf, makeRng, newVaryState, variation, varyOf } from './sfxVary';
import { STORAGE_SOUNDS } from './storageSounds';
import { WEAPON_SOUNDS } from './weaponSounds';
import { PARRY_SOUNDS } from './parrySounds';

/** WebAudio の必要な部分だけ（テストで差しかえられる）。足したものは省略可 */
export interface AudioLike {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state?: string;
  readonly sampleRate?: number;
  resume?(): Promise<void>;
  createOscillator(): {
    type: string;
    frequency: {
      value: number;
      setValueAtTime(v: number, t: number): unknown;
      exponentialRampToValueAtTime(v: number, t: number): unknown;
    };
    connect(n: unknown): unknown;
    start(t?: number): void;
    stop(t?: number): void;
  };
  createGain(): {
    gain: {
      value: number;
      setValueAtTime(v: number, t: number): unknown;
      linearRampToValueAtTime(v: number, t: number): unknown;
      exponentialRampToValueAtTime(v: number, t: number): unknown;
    };
    connect(n: unknown): unknown;
  };
  /** ノイズ用（無ければ、ノイズの部品だけ鳴らさない） */
  createBuffer?(channels: number, length: number, sampleRate: number): { getChannelData(c: number): Float32Array };
  createBufferSource?(): {
    buffer: unknown;
    loop: boolean;
    connect(n: unknown): unknown;
    start(t?: number): void;
    stop(t?: number): void;
  };
  createBiquadFilter?(): {
    type: string;
    frequency: {
      value: number;
      setValueAtTime(v: number, t: number): unknown;
      exponentialRampToValueAtTime(v: number, t: number): unknown;
    };
    Q: { value: number };
    connect(n: unknown): unknown;
  };
}

/** 角を丸める・高さが動くフィルター（ノイズ用） */
export interface ToneFilter {
  type: 'lowpass' | 'highpass' | 'bandpass';
  freq: number;
  /** 付けると、鳴っているあいだに freq → freq1 へ動く */
  freq1?: number;
  q?: number;
}

/** 倍音（木・オルゴールの音色）。基音の ratio 倍の高さ、gain 倍の大きさ、durScale 倍の長さ */
export interface TonePartial {
  ratio: number;
  gain: number;
  durScale?: number;
}

export interface Tone {
  /** noise = 角を丸めたノイズ（f0・f1 は使わない）。四角い波は使わない */
  type: 'sine' | 'triangle' | 'noise';
  /** はじめの高さ（Hz）→ おわりの高さ */
  f0: number;
  f1: number;
  /** はじまりをずらす秒 */
  delay: number;
  dur: number;
  /** 音の大きさ（全体の音量をかける前。0〜1） */
  gain: number;
  /** 立ち上がりの秒（はじめは 0.004。0.002 より短くしない） */
  attack?: number;
  filter?: ToneFilter;
  /** 倍音。基音とは別の部品として鳴る（部品の数に入る） */
  partials?: readonly TonePartial[];
}

/** BGM のいまの和音（composer の BgmChord と同じ形） */
export interface Chord {
  name: string;
  /** 0〜11（C = 0） */
  root: number;
  minor: boolean;
}

export interface SfxOutput {
  ctx: AudioLike;
  destination: unknown;
}

export interface SfxRecord {
  name: string;
  /** C を根音として作った音からのずらし（半音、-5〜+6）。和音に合わせない音は 0 */
  semis: number;
  cents: number;
  chord: string;
  big: boolean;
  /** 数の上限で鳴らさなかった */
  dropped: boolean;
}

export interface SoundFxOptions {
  /** 渡されたらこれに鳴らす（null なら鳴らさない）。無ければ自分で AudioContext を作る */
  output?: () => SfxOutput | null;
  /** いまの和音。無ければ C */
  chord?: () => Chord;
  /** levelUp・fanfare・modal を鳴らしたとき 1 回 */
  onBig?: (name: string) => void;
  /** ゆらぎの乱数のたね */
  seed?: number;
  factory?: () => AudioLike | null;
  settings?: FxSettings;
}

/** 明るく短い音（ぴこっ・ぽよん・きらーん系）。うるさい・こわい音は使わない（案 B の音色） */
export const SOUNDS = {
  /** ほる「コツ」: 木 ＋ 低いノイズ */
  dig: [
    ...wood(260, 160, 0, 0.07, 0.4),
    noise(0, 0.04, 0.18, { type: 'bandpass', freq: 900, q: 1 }),
  ],
  /** ひび「カッ」: 高い木の短い音 */
  crack: [...wood(700, 520, 0, 0.045, 0.3), noise(0, 0.02, 0.06, { type: 'bandpass', freq: 3000, q: 1 })],
  /** ひびの最後: crack ＋ 木の「コン」 */
  crackFinal: [...wood(820, 560, 0, 0.06, 0.28), ...wood(400, 300, 0, 0.09, 0.5)],
  /** ほれた「ポン」: 木 ＋ 木琴 2 音（上がる） */
  break: [...wood(220, 520, 0, 0.15, 0.7), ...xylo(hz('C6'), hz('D6'), 0.03, 0.12, 0.3), ...xylo(hz('G6'), hz('A6'), 0.06, 0.09, 0.15)],
  /** おく「コトン」 */
  place: [sine(330, 150, 0, 0.12, 0.6), tri(660, 300, 0, 0.08, 0.15)],
  /** ほれない: 木の「コン」2 つ（かたい・短い。こわくない） */
  clink: [...wood(560, 480, 0, 0.045, 0.35), ...wood(840, 720, 0.05, 0.045, 0.28)],
  /** ひびが MAX: 「キラッ」オルゴール 2 音（5 度 → オクターブ） */
  ready: [...box(hz('G6'), hz('A6'), 0.06, 0.09, 0.4), ...box(hz('C7'), hz('D7'), 0.13, 0.18, 0.35)],
  /** アイテムが入った: きらーん（オルゴール 2 音） */
  pickup: [...box(hz('C6'), hz('D6'), 0.0, 0.1, 0.45, true), ...box(hz('G6'), hz('A6'), 0.06, 0.18, 0.35)],
  /** レベルアップ: ファンファーレ（ドミソドー と のぼる、やさしい音） */
  levelUp: [
    ...xylo(hz('C5'), hz('C5'), 0, 0.14, 0.45),
    ...xylo(hz('E5'), hz('E5'), 0.13, 0.14, 0.45),
    ...xylo(hz('G5'), hz('G5'), 0.26, 0.14, 0.45),
    ...box(hz('C6'), hz('C6'), 0.39, 0.5, 0.45, true),
    ...mar(hz('C5'), hz('C5'), 0.39, 0.5, 0.35),
    sine(hz('C7'), hz('C7'), 0.39, 0.7, 0.1),
    sine(hz('E7'), hz('E7'), 0.47, 0.6, 0.06),
  ],
} as const satisfies Record<string, readonly Tone[]>;

export type SoundName = keyof typeof SOUNDS;

// ---- 表の登録: 配列そのもので、名前（ゆらぎ・和音・big）を引く ----
const ALL = new Map<string, readonly Tone[]>();
const NAME_OF = new WeakMap<readonly Tone[], string>();
function register(name: string, tones: readonly Tone[]): void {
  ALL.set(name, tones);
  NAME_OF.set(tones, name);
}
for (const table of [SOUNDS, COMBAT_SOUNDS, CRAFT_SOUNDS, FARM_SOUNDS, STORAGE_SOUNDS, WEAPON_SOUNDS, ANIMAL_SOUNDS, PARRY_SOUNDS, LEGEND_SOUNDS] as const) {
  for (const [name, tones] of Object.entries(table)) register(name, tones as readonly Tone[]);
}
register('whiff', WHIFF_TONES);

/** 効果音の表の名前の一覧（試聴ページ・テスト用） */
export function soundNames(): string[] {
  return [...ALL.keys()];
}
/** 名前から Tone の並びを引く（無ければ undefined） */
export function tonesOf(name: string): readonly Tone[] | undefined {
  return ALL.get(name);
}

/** fxVolume 0.5（はじめの値）で、preview と同じ大きさになる倍率 */
const GAIN_K = 2;
const NOISE_BOOST = 4;
const MAX_SAME_NAME = 3;
const MAX_VOICES = 48;
const MAX_RECORDS = 256;
const DEFAULT_CHORD: Chord = { name: 'C', root: 0, minor: false };
const C4 = 261.6256;

function defaultFactory(): AudioLike | null {
  const g = globalThis as unknown as {
    AudioContext?: new () => AudioLike;
    webkitAudioContext?: new () => AudioLike;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

interface Active {
  name: string;
  parts: number;
  end: number;
  big: boolean;
}

/** 音をコードで作る（ファイルは使わない）。最初に鳴らすときに AudioContext を作る */
export class SoundFx {
  private ctx: AudioLike | null = null;
  private failed = false;
  private readonly opts: SoundFxOptions;
  private readonly settings: FxSettings;
  private readonly rng: () => number;
  private readonly vary = newVaryState();
  private active: Active[] = [];
  private records: SfxRecord[] = [];
  private readonly noiseBuf = new WeakMap<object, unknown>();
  private lastClock = 0;
  /** 鳴らした回数（テスト用） */
  played = 0;

  /** `new SoundFx(opts)` でも、古い `new SoundFx(factory, settings)` でもよい */
  constructor(optsOrFactory?: SoundFxOptions | (() => AudioLike | null), settings?: FxSettings) {
    if (typeof optsOrFactory === 'function') this.opts = { factory: optsOrFactory, settings };
    else this.opts = { ...(optsOrFactory ?? {}), settings: settings ?? optsOrFactory?.settings };
    this.settings = this.opts.settings ?? FX_SETTINGS;
    this.rng = makeRng(this.opts.seed ?? 20261016);
  }

  private legacyContext(): AudioLike | null {
    if (this.ctx) return this.ctx;
    if (this.failed) return null;
    this.ctx = (this.opts.factory ?? defaultFactory)();
    if (!this.ctx) this.failed = true;
    return this.ctx;
  }

  private target(): SfxOutput | null {
    if (this.opts.output) return this.opts.output();
    const ctx = this.legacyContext();
    if (!ctx) return null;
    if (ctx.state === 'suspended') void ctx.resume?.();
    return { ctx, destination: ctx.destination };
  }

  play(name: SoundName, semitones = 0, opt?: { comboStep?: number }): void {
    this.fire(name, SOUNDS[name] as readonly Tone[], semitones, opt);
  }

  /** 音の部品の並びをそのまま鳴らす（表の配列なら名前つき。そうでなければ名前 '' で今どおり） */
  playTones(tones: readonly Tone[], semitones = 0): void {
    this.fire(NAME_OF.get(tones) ?? '', tones, semitones);
  }

  /** 鳴らした記録を返す（読むと空。長さは 256 まで） */
  drainRecords(): SfxRecord[] {
    const r = this.records;
    this.records = [];
    return r;
  }

  /** いま鳴っている部品の数 */
  activeVoices(): number {
    this.prune(this.lastClock);
    return this.active.reduce((n, a) => n + a.parts, 0);
  }

  private prune(now: number): void {
    if (this.active.length) this.active = this.active.filter((a) => a.end > now);
  }

  private record(r: SfxRecord): void {
    this.records.push(r);
    if (this.records.length > MAX_RECORDS) this.records.splice(0, this.records.length - MAX_RECORDS);
  }

  private noiseBuffer(ctx: AudioLike): unknown {
    let b = this.noiseBuf.get(ctx);
    if (b) return b;
    const rate = ctx.sampleRate ?? 44100;
    b = ctx.createBuffer!(1, rate, rate);
    const x = (b as { getChannelData(c: number): Float32Array }).getChannelData(0);
    const r = makeRng(12345); // 毎回同じザザッ
    for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1;
    this.noiseBuf.set(ctx, b);
    return b;
  }

  private fire(name: string, tones: readonly Tone[], semitones: number, opt?: { comboStep?: number }): void {
    const vol = this.settings.fxVolume;
    if (!(vol > 0)) return;
    const out = this.target();
    if (!out) return;
    const { ctx, destination } = out;
    const now = ctx.currentTime;
    this.lastClock = now;
    this.prune(now);

    const chord = this.opts.chord?.() ?? DEFAULT_CHORD;
    const canNoise = !!(ctx.createBufferSource && ctx.createBuffer);
    const usable = tones.filter((t) => t.type !== 'noise' || (canNoise && (!t.filter || ctx.createBiquadFilter)));
    const parts = usable.reduce((n, t) => n + 1 + (t.partials?.length ?? 0), 0);
    const big = !!(name && varyOf(name).big);

    // ---- 数の上限（§6.3） ----
    let drop = false;
    if (big) {
      if (this.active.some((a) => a.big)) drop = true;
    } else if (name && this.active.filter((a) => a.name === name).length >= MAX_SAME_NAME) {
      drop = true;
    } else if (this.active.reduce((n, a) => n + a.parts, 0) + parts > MAX_VOICES) {
      drop = true;
    }

    // 落とす音は ゆらぎの乱数も「直前の和音の音」も使わない（あとの音の並びを変えない）
    if (drop) {
      this.record({ name, semis: 0, cents: 0, chord: name ? chord.name : 'C', big, dropped: true });
      return;
    }
    const v = variation(name, chord, this.rng, this.vary, opt?.comboStep);
    this.record({ name, semis: v.semis, cents: v.cents, chord: name ? chord.name : 'C', big, dropped: false });

    const ratio = Math.pow(2, (v.shift + (v.cents + semitones * 100) / 100) / 12);
    const pitch = (f: number): number => {
      let g = f;
      if (v.minor) {
        // C を根音として作った音の「ミ」を半音下げる
        const pc = (((Math.round(12 * Math.log2(f / C4)) % 12) + 12) % 12);
        if (pc === 4) g = f * Math.pow(2, -1 / 12);
      }
      return g * ratio;
    };
    const level = (name ? levelOf(name) : 1) * v.gain * vol * GAIN_K;

    let end = now;
    for (const t of usable) {
      const start = now + t.delay * v.dur;
      const dur = t.dur * v.dur;
      const attack = Math.max(0.002, t.attack ?? 0.004);
      const stop = start + Math.max(dur, attack + 0.01);
      const gain = ctx.createGain();
      // 時刻の丸めで 1 サンプルだけ「はじめの値 1」が漏れて、ぷつっと鳴るのを防ぐ
      gain.gain.value = 0.0001;
      // ノイズは細い帯だけ通すので、同じ gain でも小さく聞こえる。NOISE_BOOST 倍して sine とそろえる
      const peak = Math.max(0.0002, Math.min(t.type === 'noise' ? 8 : 1, t.gain * level * (t.type === 'noise' ? NOISE_BOOST : 1)));
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(peak, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, stop);
      if (t.type === 'noise') {
        const src = ctx.createBufferSource!();
        src.buffer = this.noiseBuffer(ctx);
        src.loop = true;
        let node: { connect(n: unknown): unknown } = src;
        if (t.filter) {
          const f = ctx.createBiquadFilter!();
          f.type = t.filter.type;
          f.Q.value = t.filter.q ?? 0.7;
          f.frequency.setValueAtTime(t.filter.freq, start);
          if (t.filter.freq1) f.frequency.exponentialRampToValueAtTime(Math.max(20, t.filter.freq1), stop);
          node.connect(f);
          node = f;
        }
        node.connect(gain);
        gain.connect(destination);
        src.start(start);
        src.stop(stop + 0.02);
      } else {
        const layers = [{ ratio: 1, gain: 1, durScale: 1 }, ...(t.partials ?? []).map((p) => ({ ratio: p.ratio, gain: p.gain, durScale: p.durScale ?? 1 }))];
        layers.forEach((l, i) => {
          const g = i === 0 ? gain : ctx.createGain();
          if (i > 0) g.gain.value = 0.0001;
          const lstop = i === 0 ? stop : start + Math.max(dur * l.durScale, attack + 0.01);
          if (i > 0) {
            g.gain.setValueAtTime(0.0001, start);
            g.gain.linearRampToValueAtTime(Math.max(0.0002, peak * l.gain), start + attack);
            g.gain.exponentialRampToValueAtTime(0.0001, lstop);
          }
          const osc = ctx.createOscillator();
          osc.type = t.type;
          osc.frequency.setValueAtTime(pitch(t.f0) * l.ratio, start);
          osc.frequency.exponentialRampToValueAtTime(Math.max(20, pitch(t.f1) * l.ratio), lstop);
          osc.connect(g);
          g.connect(destination);
          osc.start(start);
          osc.stop(lstop + 0.02);
        });
      }
      end = Math.max(end, stop + 0.02);
    }
    this.active.push({ name, parts, end, big });
    this.played++;
    if (big) this.opts.onBig?.(name);
  }
}
