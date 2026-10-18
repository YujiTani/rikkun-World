import type { YokaiTitle } from '../contracts';

/**
 * 二つ名の出現音（BALANCE.md §5・§6）。加工した mp3（版 B「しんぞう と おてらの かね」）を 読みこんで 鳴らす。
 * - はじめに 読みこんで（preload）、鳴らすときは 待たない。読めない・音量 0・AudioContext なし は 鳴らさず、止まらない。
 * - 音量は「効果音の音量」の設定をかける。倍率は 1 以下（大きくしない）。
 * - 鳴っている間の 2 体目を 重ねない時間は CombatFx が見る（TITLE_RULES の soundSeconds）。
 * - AudioContext は 使うときに 作る（プレイヤーの操作のあと。SoundFx と同じ）。
 */
export type NickTitle = Exclude<YokaiTitle, 'none'>;

/** 音ファイルの場所（Vite が public/ を そのまま配る） */
export const TITLE_SOUND_URLS: Record<NickTitle, string> = {
  oyabun: './sound/nick/appear_oyabun.mp3',
  taisho: './sound/nick/appear_taisho.mp3',
  nushi: './sound/nick/appear_nushi.mp3',
};

/** 音量の設定（0〜1）にかける 倍率（1 以下）。オーナーが 試聴ページ（音量 0.5）で 聞いて 決めた大きさのまま（大きくしない） */
export const TITLE_SOUND_MASTER = 1;

const TITLES: readonly NickTitle[] = ['oyabun', 'taisho', 'nushi'];

/** WebAudio の 使う口だけ（テストで うその物を渡せる） */
export interface TitleAudio {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state?: string;
  resume?(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  createBufferSource(): {
    buffer: unknown;
    onended: null | (() => void);
    connect(n: unknown): unknown;
    disconnect(): void;
    start(t?: number): void;
    stop(t?: number): void;
  };
  createGain(): {
    gain: {
      value: number;
      setValueAtTime(v: number, t: number): unknown;
    };
    connect(n: unknown): unknown;
    disconnect(): void;
  };
}

export interface TitleSoundDeps {
  /** AudioContext（作れなければ null） */
  audio: () => TitleAudio | null;
  /** 音ファイルの 中身（fetch の代わり） */
  load: (url: string) => Promise<ArrayBuffer>;
  /** 「効果音の音量」0〜1 */
  volume: () => number;
  /** 鳴らす先（なければ ctx.destination）。ゲームでは ミキサーの sfx バス */
  output?: () => unknown;
}

export class TitleSound {
  private readonly buffers: Partial<Record<NickTitle, unknown>> = {};
  private loading: Promise<void> | null = null;
  /** 読みこみが 1 回 失敗した（次の play で 1 回だけ やりなおす） */
  private failedOnce = false;
  private retried = false;
  /** 実際に 鳴らしはじめた 回数（テスト用） */
  readonly played: Record<NickTitle, number> = { oyabun: 0, taisho: 0, nushi: 0 };

  constructor(private readonly d: TitleSoundDeps) {}

  /** 3 つを 読みこむ（読めた物は とばす）。失敗しても reject しない（その音は 鳴らさない） */
  preload(): Promise<void> {
    this.loading ??= (async () => {
      let ctx: TitleAudio | null = null;
      try {
        ctx = this.d.audio();
      } catch {
        ctx = null;
      }
      if (ctx) {
        await Promise.all(
          TITLES.filter((t) => this.buffers[t] === undefined).map(async (t) => {
            try {
              const raw = await this.d.load(TITLE_SOUND_URLS[t]);
              this.buffers[t] = await ctx.decodeAudioData(raw);
            } catch {
              // 読めなかった: この音は 鳴らさない
            }
          }),
        );
      }
      this.failedOnce = !this.ready();
    })();
    return this.loading;
  }

  /** 3 つとも 読めた */
  ready(): boolean {
    return TITLES.every((t) => this.buffers[t] !== undefined);
  }

  /** 鳴らしはじめたら true。読めていない・音量 0・AudioContext なし は false。例外を投げない */
  play(title: NickTitle): boolean {
    try {
      const buf = this.buffers[title];
      if (buf === undefined) {
        if (this.failedOnce && !this.retried) {
          this.retried = true;
          this.loading = null;
          void this.preload();
        }
        return false;
      }
      const vol = Math.min(1, this.d.volume());
      if (!(vol > 0)) return false;
      const ctx = this.d.audio();
      if (!ctx) return false;
      if (ctx.state === 'suspended') void ctx.resume?.();
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buf;
      gain.gain.setValueAtTime(vol * TITLE_SOUND_MASTER, ctx.currentTime);
      src.connect(gain);
      gain.connect(this.d.output?.() ?? ctx.destination);
      src.onended = () => {
        src.disconnect();
        gain.disconnect();
      };
      src.start();
      this.played[title]++;
      return true;
    } catch {
      return false;
    }
  }
}

/** ふつうの 作り方（効果音と 同じ AudioContext と fetch） */
export function createBrowserTitleSound(volume: () => number, audio: () => unknown, output?: () => unknown): TitleSound {
  return new TitleSound({
    // 効果音（SoundFx）と 同じ ミキサーの AudioContext と sfx バスを使う
    audio: () => audio() as TitleAudio | null,
    output,
    load: async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.arrayBuffer();
    },
    volume,
  });
}
