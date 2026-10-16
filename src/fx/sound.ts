import { FX_SETTINGS, type FxSettings } from './config';

/** WebAudio の必要な部分だけ（テストで差しかえられる） */
export interface AudioLike {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state?: string;
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
}

export interface Tone {
  type: 'sine' | 'triangle' | 'square';
  /** はじめの高さ（Hz）→ おわりの高さ */
  f0: number;
  f1: number;
  /** はじまりをずらす秒 */
  delay: number;
  dur: number;
  /** 音の大きさ（全体の音量をかける前。0〜1） */
  gain: number;
}

/** 明るく短い音（ぴこっ・ぽよん・きらーん系）。うるさい・こわい音は使わない */
const SOUNDS = {
  dig: [{ type: 'triangle', f0: 300, f1: 200, delay: 0, dur: 0.06, gain: 0.35 }],
  crack: [{ type: 'square', f0: 700, f1: 520, delay: 0, dur: 0.045, gain: 0.18 }],
  crackFinal: [
    { type: 'square', f0: 820, f1: 560, delay: 0, dur: 0.06, gain: 0.26 },
    { type: 'triangle', f0: 400, f1: 300, delay: 0, dur: 0.07, gain: 0.3 },
  ],
  break: [
    { type: 'sine', f0: 200, f1: 600, delay: 0, dur: 0.15, gain: 0.7 },
    { type: 'triangle', f0: 1000, f1: 1500, delay: 0.03, dur: 0.1, gain: 0.3 },
    { type: 'sine', f0: 1800, f1: 2200, delay: 0.06, dur: 0.07, gain: 0.15 },
  ],
  place: [{ type: 'sine', f0: 330, f1: 150, delay: 0, dur: 0.12, gain: 0.7 }],
  clink: [
    { type: 'square', f0: 1500, f1: 1400, delay: 0, dur: 0.04, gain: 0.2 },
    { type: 'triangle', f0: 2100, f1: 2000, delay: 0, dur: 0.05, gain: 0.2 },
  ],
  /** ひびが MAX: 「キラッ」（いま押して！） */
  ready: [
    { type: 'sine', f0: 1568, f1: 1760, delay: 0.06, dur: 0.09, gain: 0.4 },
    { type: 'sine', f0: 2093, f1: 2349, delay: 0.13, dur: 0.18, gain: 0.35 },
  ],
  /** アイテムが入った: きらーん（ぴこっ＋高い音） */
  pickup: [
    { type: 'sine', f0: 880, f1: 1040, delay: 0.05, dur: 0.1, gain: 0.5 },
    { type: 'sine', f0: 1320, f1: 1560, delay: 0.11, dur: 0.16, gain: 0.4 },
  ],
  /** レベルアップ: ファンファーレ（ドミソドー と のぼる、やさしい音） */
  levelUp: [
    { type: 'triangle', f0: 523, f1: 523, delay: 0, dur: 0.14, gain: 0.5 },
    { type: 'triangle', f0: 659, f1: 659, delay: 0.14, dur: 0.14, gain: 0.5 },
    { type: 'triangle', f0: 784, f1: 784, delay: 0.28, dur: 0.14, gain: 0.5 },
    { type: 'triangle', f0: 1047, f1: 1047, delay: 0.42, dur: 0.4, gain: 0.55 },
    { type: 'sine', f0: 2093, f1: 2093, delay: 0.42, dur: 0.5, gain: 0.2 },
  ],
} as const satisfies Record<string, readonly Tone[]>;

export type SoundName = keyof typeof SOUNDS;

const MASTER = 0.3;

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

/** 音をコードで作る（ファイルは使わない）。最初に鳴らすときに AudioContext を作る */
export class SoundFx {
  private ctx: AudioLike | null = null;
  private failed = false;
  /** 鳴らした回数（テスト用） */
  played = 0;

  constructor(
    private readonly factory: () => AudioLike | null = defaultFactory,
    private readonly settings: FxSettings = FX_SETTINGS,
  ) {}

  /** 使っている AudioContext（なければ 作る。出現音の音ファイルも 同じ物を使う） */
  audioContext(): AudioLike | null {
    return this.context();
  }

  private context(): AudioLike | null {
    if (this.ctx) return this.ctx;
    if (this.failed) return null;
    this.ctx = this.factory();
    if (!this.ctx) this.failed = true;
    return this.ctx;
  }

  play(name: SoundName, semitones = 0): void {
    this.playTones(SOUNDS[name] as readonly Tone[], semitones);
  }

  /** 音の部品の並びをそのまま鳴らす（M3 の音など。`combatSounds.ts`） */
  playTones(tones: readonly Tone[], semitones = 0): void {
    const vol = this.settings.fxVolume;
    if (!(vol > 0)) return;
    const ctx = this.context();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume?.();
    const ratio = Math.pow(2, semitones / 12);
    const now = ctx.currentTime;
    for (const t of tones) {
      const start = now + t.delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = t.type;
      osc.frequency.setValueAtTime(t.f0 * ratio, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, t.f1 * ratio), start + t.dur);
      const peak = Math.max(0.0002, Math.min(1, t.gain * vol * MASTER));
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + t.dur + 0.02);
    }
    this.played++;
  }
}
