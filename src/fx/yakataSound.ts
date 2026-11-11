/**
 * ようかいの やかたの 音（MINE-1F §3.4・§3.5・F16 ④）。加工した ogg 4 つ〔public/sound/yakata/〕を 読みこんで 鳴らす。お手本は titleSound.ts。
 *  - ふんいき・挑戦の 曲は ループ〔`startLoop`・`stopLoop`〕。門の 音 2 つは 1 回〔`playOnce`〕。
 *  - はじめに 読みこんで（preload）、鳴らす ときは 待たない。読めない・失敗・音量 0・AudioContext なしは 鳴らさず、止まらない。
 *  - 音量は「効果音の 音量」の 設定を かける。かける 倍率は 1 以下〔`YAKATA_GAIN_MAX`〕。
 *  - 数〔dB・時間〕は `yakataSoundTable()`〔world/gen の 窓口〕と `docs/audio/MINE-1F.md`。ここには 書かない。
 */
export type YakataSoundName = 'ambience' | 'challenge' | 'gate_close' | 'gate_open';
export type YakataLoopName = Extract<YakataSoundName, 'ambience' | 'challenge'>;
export type YakataOnceName = Extract<YakataSoundName, 'gate_close' | 'gate_open'>;

/** 音ファイルの 場所（Vite が public/ を そのまま 配る） */
export const YAKATA_SOUND_URLS: Record<YakataSoundName, string> = {
  ambience: './sound/yakata/ambience.ogg',
  challenge: './sound/yakata/challenge.ogg',
  gate_close: './sound/yakata/gate_close.ogg',
  gate_open: './sound/yakata/gate_open.ogg',
};
const NAMES = Object.keys(YAKATA_SOUND_URLS) as YakataSoundName[];

/** かける 音量の 倍率の いちばん 大きい 数（大きく しない） */
export const YAKATA_GAIN_MAX = 1;

/** WebAudio の 使う 口だけ（テストで うその 物を わたせる） */
export interface YakataAudio {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state?: string;
  resume?(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  createBufferSource(): {
    buffer: unknown;
    loop: boolean;
    onended: null | (() => void);
    connect(n: unknown): unknown;
    disconnect(): void;
    start(t?: number): void;
    stop(t?: number): void;
  };
  createGain(): {
    gain: { value: number; setValueAtTime(v: number, t: number): unknown; linearRampToValueAtTime(v: number, t: number): unknown };
    connect(n: unknown): unknown;
    disconnect(): void;
  };
}

export interface YakataSoundDeps {
  audio: () => YakataAudio | null;
  load: (url: string) => Promise<ArrayBuffer>;
  /** 「効果音の 音量」0〜1 */
  volume: () => number;
  /** 鳴らす 先（なければ ctx.destination）。門の 音は 効果音の バス */
  output?: () => unknown;
  /** ループ〔ふんいき・挑戦の 曲〕の 音量〔「音楽の 音量」。なければ volume〕 */
  loopVolume?: () => number;
  /** ループの 鳴らす 先〔BGM の 口。なければ output〕 */
  loopOutput?: () => unknown;
}

interface LoopRun {
  name: YakataLoopName;
  db: number;
  src: ReturnType<YakataAudio['createBufferSource']>;
  gain: ReturnType<YakataAudio['createGain']>;
}

/** dB → 倍率（1 以下に おさえる） */
const dbGain = (db: number): number => Math.min(YAKATA_GAIN_MAX, 10 ** (db / 20));

export class YakataSound {
  private readonly buffers: Partial<Record<YakataSoundName, unknown>> = {};
  private loading: Promise<void> | null = null;
  private failedOnce = false;
  private retried = false;
  private readonly running: LoopRun[] = [];
  private readonly applied: number[] = [];
  /** 実際に 鳴らしはじめた 回数（テスト用） */
  readonly played: Record<YakataSoundName, number> = { ambience: 0, challenge: 0, gate_close: 0, gate_open: 0 };

  constructor(private readonly d: YakataSoundDeps) {}

  /** 4 つを 読みこむ。失敗しても reject しない（その 音は 鳴らさない） */
  preload(): Promise<void> {
    this.loading ??= (async () => {
      let ctx: YakataAudio | null = null;
      try {
        ctx = this.d.audio();
      } catch {
        ctx = null;
      }
      if (ctx) {
        await Promise.all(
          NAMES.filter((n) => this.buffers[n] === undefined).map(async (n) => {
            try {
              this.buffers[n] = await ctx.decodeAudioData(await this.d.load(YAKATA_SOUND_URLS[n]));
            } catch {
              // 読めなかった: この 音は 鳴らさない
            }
          }),
        );
      }
      this.failedOnce = !this.ready();
    })();
    return this.loading;
  }

  /** 4 つとも 読めた */
  ready(): boolean {
    return NAMES.every((n) => this.buffers[n] !== undefined);
  }

  /** 今 頼んで いる ループ */
  loops(): { name: YakataLoopName; db: number }[] {
    return this.running.map((l) => ({ name: l.name, db: l.db }));
  }

  /** これまでに かけた 倍率（テスト用） */
  gains(): number[] {
    return [...this.applied];
  }

  /** 1 回 鳴らす。鳴らしはじめたら true */
  playOnce(name: YakataOnceName): boolean {
    return this.start(name, false, 0) !== null;
  }

  /** ループを はじめる〔db は ふんいき・挑戦の 曲の 大きさ。0 = そのまま〕。同じ ループが 鳴って いれば 何も しない（true） */
  startLoop(name: YakataLoopName, db: number): boolean {
    if (this.running.some((l) => l.name === name)) return true;
    const r = this.start(name, true, db);
    if (!r) return false;
    this.running.push({ name, db, ...r });
    return true;
  }

  /** ループを fadeSec 秒で 小さく して とめる。頼んで いない 名前は 何も しない */
  stopLoop(name: YakataLoopName, fadeSec: number): void {
    const i = this.running.findIndex((l) => l.name === name);
    if (i < 0) return;
    const [l] = this.running.splice(i, 1);
    try {
      const ctx = this.d.audio();
      const t = ctx?.currentTime ?? 0;
      l!.gain.gain.setValueAtTime(l!.gain.gain.value, t);
      l!.gain.gain.linearRampToValueAtTime(0, t + fadeSec);
      l!.src.stop(t + fadeSec);
    } catch {
      // 止まらない
    }
  }

  private start(name: YakataSoundName, loop: boolean, db: number): { src: LoopRun['src']; gain: LoopRun['gain'] } | null {
    try {
      const buf = this.buffers[name];
      if (buf === undefined) {
        if (this.failedOnce && !this.retried) {
          this.retried = true;
          this.loading = null;
          void this.preload();
        }
        return null;
      }
      const vol = Math.min(1, (loop ? this.d.loopVolume : this.d.volume)?.call(this.d) ?? this.d.volume());
      if (!(vol > 0)) return null;
      const ctx = this.d.audio();
      if (!ctx) return null;
      if (ctx.state === 'suspended') void ctx.resume?.();
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buf;
      src.loop = loop;
      const g = Math.min(YAKATA_GAIN_MAX, vol * dbGain(db));
      this.applied.push(g);
      gain.gain.setValueAtTime(g, ctx.currentTime);
      src.connect(gain);
      gain.connect((loop ? this.d.loopOutput?.() : undefined) ?? this.d.output?.() ?? ctx.destination);
      src.onended = () => {
        src.disconnect();
        gain.disconnect();
      };
      src.start();
      this.played[name]++;
      return { src, gain };
    } catch {
      return null;
    }
  }
}

/** ふつうの 作り方（効果音と 同じ AudioContext と fetch） */
export function createBrowserYakataSound(volume: () => number, audio: () => unknown, output?: () => unknown, loops?: { volume: () => number; output?: () => unknown }): YakataSound {
  return new YakataSound({
    audio: () => audio() as YakataAudio | null,
    output,
    loopVolume: loops?.volume,
    loopOutput: loops?.output,
    load: async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.arrayBuffer();
    },
    volume,
  });
}
