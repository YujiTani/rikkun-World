import type { SoundFx, Tone } from './sound';
import { box, hz, noise, shaka, sine, suzu, swish, tri } from './sfxVoices';
import { FX_SETTINGS } from './config';
import { logSound } from './soundLog';

/**
 * WEAPON-7 §3.5・§2.6 の 音（レジェンダリー武器）。コードで 作る。
 * WEAPON-8 の 新しい 音（windWave・thunderSlash・spiralWind・ため音 chargeRise/chargeReady/chargeHold）は
 * 音の ファイル（public/sound/legend/*.ogg。下の LEGEND_FILES）を 鳴らす。ファイルが まだ 読めて いない ときだけ、
 * この 表の 合成音で 代わりに する。出どころは public/sound/legend/README.md。
 * こわすぎない・急な 大音量に しない（どれも gain 0.6 以下・1.2 秒以内）。
 * 名前は `combat.sounds()` の 名前と 同じ（`lightningFar` は 『lightning』 として きろくする）。
 */
/** 風神剣の 真空波「ヒュオッ」: 高さの ちがう 3 つ（前と ちがう 物を えらぶ。小さく 短く） */
export const WIND_WAVE_VARIANTS: readonly (readonly Tone[])[] = [
  [swish(1500, 3000, 0, 0.14, 0.12, 1.2), shaka(0.02, 0.06, 0.05, 5500)],
  [swish(1900, 3800, 0, 0.13, 0.12, 1.2), shaka(0.02, 0.06, 0.05, 6000)],
  [swish(1200, 2400, 0, 0.15, 0.12, 1.2), shaka(0.02, 0.06, 0.05, 5000)],
];

export const LEGEND_SOUNDS = {
  /** 真空波「ヒュオッ」（くり返す 行動なので 小さく 短く。高さは playLegend の variant で 3 つから） */
  windWave: WIND_WAVE_VARIANTS[0]!,
  /** ため いっぱい「ピキーン」: 高い 2 音 ＋ 鈴の つぶ（小さく 明るく） */
  chargeReady: [...box(hz('G6'), hz('G6') * 1.01, 0, 0.09, 0.3), ...box(hz('D7'), hz('D7') * 1.01, 0.07, 0.2, 0.28), ...suzu(0.1, 3, 0.04, 0.1)],
  /** 雷「ビシッ… ゴロゴロ ドーン」: 高い ひび割れ ＋ 低い うなり（だんだん 小さく）＋ 低い ドン。うなりは ゆっくり 入る */
  lightning: [
    noise(0, 0.06, 0.22, { type: 'highpass', freq: 3200, q: 0.7 }, 0.003),
    swish(3600, 700, 0, 0.14, 0.2, 1.2),
    noise(0.1, 0.7, 0.3, { type: 'lowpass', freq: 420, freq1: 140, q: 0.8 }, 0.06),
    sine(70, 38, 0.1, 0.55, 0.45, 0.02),
    tri(120, 60, 0.12, 0.3, 0.14, 0.02),
  ],
  /** ためわざ「らせんの かぜ」: 音の ファイルが 読めない ときの 代わり（風 ＋ やわらかい 低い 押し） */
  spiralWind: [swish(900, 2000, 0, 0.6, 0.18, 1.5), sine(90, 55, 0, 0.3, 0.3, 0.02)],
  /** ため中・ため続け: ファイルが 読めない ときの 代わり（ごく 小さな 風）。ふだんは ファイルの 音 */
  chargeRise: [swish(600, 1500, 0, 0.9, 0.05, 1.5)],
  chargeHold: [swish(900, 1100, 0, 0.5, 0.03, 1.5)],
  /** 空が 見えない ときの 遠くの 雷（小さく・低く） */
  lightningFar: [noise(0.05, 0.6, 0.12, { type: 'lowpass', freq: 300, freq1: 120, q: 0.8 }, 0.1), sine(60, 36, 0.08, 0.5, 0.2, 0.05)],
  /** ふつうの わざに 重ねる「ビシューン」: 上がる シャカ ＋ 小さな ひび割れ（小さく 短く） */
  thunderSlash: [swish(1400, 5200, 0, 0.12, 0.16, 1.5), shaka(0.02, 0.04, 0.1, 6000)],
  /** ヌシが レジェンダリーを おとした「キラキラ…」: 上がる 6 つの オルゴール（花火と ファンファーレに 重なるので 大きく しない） */
  legendDrop: [
    ...box(hz('C6'), hz('C6') * 1.01, 0, 0.12, 0.22),
    ...box(hz('E6'), hz('E6') * 1.01, 0.07, 0.12, 0.22),
    ...box(hz('G6'), hz('G6') * 1.01, 0.14, 0.12, 0.22),
    ...box(hz('C7'), hz('C7') * 1.01, 0.21, 0.14, 0.22),
    ...box(hz('E7'), hz('E7') * 1.0, 0.28, 0.16, 0.2),
    ...box(hz('G7'), hz('G7') * 1.0, 0.35, 0.5, 0.18),
    ...suzu(0.3, 4, 0.05, 0.12),
  ],
} as const satisfies Record<string, readonly Tone[]>;

export type LegendSoundName = keyof typeof LEGEND_SOUNDS;
export type LegendLoopName = 'chargeRise' | 'chargeHold';
/** 剣ごとの 味（ため音の 風・ばちばちの 層）。なければ 味なし */
export type LegendFlavor = 'fujin' | 'raijin' | null | undefined;

// ---------------------------------------------------------------- 音の ファイル

const DIR = './sound/legend/';
const u = (n: string): string => `${DIR}${n}.ogg`;
/** 音ファイルの 場所（Vite が public/ を そのまま配る）。titleSound と 同じ 相対パス */
export const LEGEND_FILES = {
  /** 3 とおり（毎回 ちがう 物を えらぶ） */
  windWave: [u('windWave_0'), u('windWave_1'), u('windWave_2')],
  thunderSlash: [u('thunderSlash_0'), u('thunderSlash_1'), u('thunderSlash_2')],
  spiralWind: [u('spiralWind')],
  chargeReady: [u('chargeReady')],
  /** 味なし / 風神 / 雷神 */
  chargeRise: { none: u('chargeRise'), fujin: u('chargeRise_fujin'), raijin: u('chargeRise_raijin') },
  chargeHold: { none: u('chargeHold'), fujin: u('chargeHold_fujin'), raijin: u('chargeHold_raijin') },
} as const;

/** ファイルは ミキサーの 前（0.6 倍の master の 前）の 大きさに そろえて ある。fxVolume 0.5 の とき 倍率 1 */
export const LEGEND_FILE_GAIN_PER_VOLUME = 2;
/** 同じ 音を 重ねて 鳴らす 上限（連打しても 耳が 痛く ならない）。SoundFx の 同名 3 つと 同じ */
export const LEGEND_MAX_SAME = 3;
/** ため続けの ループが ふわっと 入る 秒 */
export const LEGEND_HOLD_FADE_IN = 0.12;

interface FileNode {
  connect(n: unknown): unknown;
  disconnect(): void;
}
interface FileSource extends FileNode {
  buffer: unknown;
  loop: boolean;
  onended: null | (() => void);
  start(t?: number): void;
  stop(t?: number): void;
}
interface FileGain extends FileNode {
  gain: {
    value: number;
    setValueAtTime(v: number, t: number): unknown;
    linearRampToValueAtTime(v: number, t: number): unknown;
    cancelScheduledValues?(t: number): unknown;
  };
}
/** WebAudio の 使う 口だけ（テストで うその 物を 渡せる） */
export interface LegendCtx {
  readonly currentTime: number;
  readonly state?: string;
  resume?(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  createBufferSource(): FileSource;
  createGain(): FileGain;
}
interface LegendOut {
  ctx: LegendCtx;
  destination: unknown;
}

let loader: (url: string) => Promise<ArrayBuffer> = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.arrayBuffer();
};
/** テスト用: 読みこみ（fetch の 代わり）と 状態を 作りなおす */
export function resetLegendFiles(load?: (url: string) => Promise<ArrayBuffer>): void {
  if (load) loader = load;
  states = new WeakMap();
  rotate.windWave = 0;
  rotate.thunderSlash = 0;
  for (const k of Object.keys(playing)) delete playing[k];
}

interface CtxState {
  buffers: Map<string, unknown>;
  loading: Promise<void> | null;
}
let states = new WeakMap<object, CtxState>();
const rotate = { windWave: 0, thunderSlash: 0 };
/** 名前ごとの 鳴っている 数 */
const playing: Record<string, number> = {};

function allUrls(): string[] {
  return [
    ...LEGEND_FILES.windWave,
    ...LEGEND_FILES.thunderSlash,
    ...LEGEND_FILES.spiralWind,
    ...LEGEND_FILES.chargeReady,
    ...Object.values(LEGEND_FILES.chargeRise),
    ...Object.values(LEGEND_FILES.chargeHold),
  ];
}

function outputOf(sound: unknown): LegendOut | null {
  try {
    // SoundFx は 鳴らす 先（ミキサーの sfx バス）を target() で 持つ。ほかの 物（テストの うそ）は null
    const t = (sound as { target?: () => LegendOut | null }).target?.();
    if (!t || typeof t.ctx?.decodeAudioData !== 'function' || typeof t.ctx.createBufferSource !== 'function') return null;
    return t;
  } catch {
    return null;
  }
}

function stateOf(ctx: LegendCtx): CtxState {
  let st = states.get(ctx);
  if (!st) {
    st = { buffers: new Map(), loading: null };
    states.set(ctx, st);
  }
  return st;
}

function load(ctx: LegendCtx): Promise<void> {
  const st = stateOf(ctx);
  st.loading ??= Promise.all(
    allUrls().map(async (url) => {
      try {
        st.buffers.set(url, await ctx.decodeAudioData(await loader(url)));
      } catch {
        // 読めなかった: その 音は 合成音で 代わりに する
      }
    }),
  ).then(() => undefined);
  return st.loading;
}

/** 音の ファイルを 読みこむ（読めた 物は とばす）。失敗しても reject しない。最初の 操作の あとに 呼ぶと、最初の 1 回から ファイルの 音が 鳴る */
export function preloadLegendSounds(sound: Pick<SoundFx, 'playTones'>): Promise<void> {
  const o = outputOf(sound);
  return o ? load(o.ctx) : Promise.resolve();
}

function volume(): number {
  const v = FX_SETTINGS.fxVolume;
  return v > 0 ? Math.min(1, v) * LEGEND_FILE_GAIN_PER_VOLUME : 0;
}

/** 読めている バッファ（なければ null。読みこみは 始める） */
function bufferFor(o: LegendOut, url: string): unknown {
  const st = stateOf(o.ctx);
  void load(o.ctx);
  return st.buffers.get(url) ?? null;
}

function start(o: LegendOut, buf: unknown, vol: number, loop: boolean, fadeIn: number): { src: FileSource; gain: FileGain } | null {
  try {
    const { ctx } = o;
    if (ctx.state === 'suspended') void ctx.resume?.();
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    src.loop = loop;
    const t = ctx.currentTime;
    if (fadeIn > 0) {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(vol, t + fadeIn);
    } else {
      gain.gain.setValueAtTime(vol, t);
    }
    src.connect(gain);
    gain.connect(o.destination);
    src.start(t);
    return { src, gain };
  } catch {
    return null;
  }
}

/** 1 回 鳴らす。鳴らせたら true（同じ 名前が 3 つ 鳴っている ときは 鳴らさず true: 記録だけ 残す） */
function playFile(sound: unknown, name: string, url: string): boolean {
  const o = outputOf(sound);
  if (!o) return false;
  const buf = bufferFor(o, url);
  if (buf === null) return false;
  const vol = volume();
  if (!(vol > 0)) return true;
  if ((playing[name] ?? 0) >= LEGEND_MAX_SAME) return true;
  const s = start(o, buf, vol, false, 0);
  if (!s) return false;
  playing[name] = (playing[name] ?? 0) + 1;
  s.src.onended = () => {
    playing[name] = Math.max(0, (playing[name] ?? 1) - 1);
    s.src.disconnect();
    s.gain.disconnect();
  };
  return true;
}

/**
 * 効果音を 1 回 鳴らす。`windWave` は variant（0〜2）で 3 とおりから、`thunderSlash` は variant が なければ 順番に 3 とおり。
 * `chargeReady`・`spiralWind` は 1 つ。ほかは 今までの 合成音。ファイルが まだ 読めて いない ときは 合成音で 代わりに する。
 */
export function playLegend(sound: Pick<SoundFx, 'playTones'>, name: LegendSoundName, variant?: number): void {
  let played = false;
  if (name === 'windWave' || name === 'thunderSlash') {
    const list = LEGEND_FILES[name];
    const i = variant === undefined ? rotate[name]++ : variant;
    played = playFile(sound, name, list[((i % list.length) + list.length) % list.length]!);
  } else if (name === 'spiralWind' || name === 'chargeReady') {
    played = playFile(sound, name, LEGEND_FILES[name][0]);
  }
  if (!played) {
    const v = variant ?? 0;
    sound.playTones((name === 'windWave' ? WIND_WAVE_VARIANTS[v % WIND_WAVE_VARIANTS.length]! : LEGEND_SOUNDS[name]) as readonly Tone[]);
  }
  logSound(name === 'lightningFar' ? 'lightning' : name);
}

/**
 * ため音の ループ。`chargeRise`（ための 1 秒。1 回）・`chargeHold`（ため続け。ループ 1.2 秒）。
 * `flavor` は 剣の 味（'fujin' 風 / 'raijin' ばちばち / なし）。stop(秒) で その 秒数かけて 小さく して 止める（0 で すぐ）。
 * 2 回 呼んでも 安全。ファイルが 読めて いない ときは 合成音の 小さな 風で 代わりに する（止められない 短い 音）。
 */
export function startLegendLoop(sound: Pick<SoundFx, 'playTones'>, name: LegendLoopName, flavor?: LegendFlavor): { stop(fadeSec: number): void } {
  logSound(name);
  const o = outputOf(sound);
  const url = LEGEND_FILES[name][flavor ?? 'none'];
  const buf = o ? bufferFor(o, url) : null;
  const vol = volume();
  if (!o || buf === null) {
    sound.playTones(LEGEND_SOUNDS[name]);
    return { stop() {} };
  }
  if (!(vol > 0)) return { stop() {} };
  const s = start(o, buf, vol, name === 'chargeHold', name === 'chargeHold' ? LEGEND_HOLD_FADE_IN : 0);
  if (!s) return { stop() {} };
  let stopped = false;
  const cleanup = (): void => {
    s.src.disconnect();
    s.gain.disconnect();
  };
  s.src.onended = cleanup;
  return {
    stop(fadeSec: number): void {
      if (stopped) return;
      stopped = true;
      try {
        const t = o.ctx.currentTime;
        const f = Math.max(0, fadeSec);
        if (f > 0) {
          s.gain.gain.cancelScheduledValues?.(t);
          s.gain.gain.setValueAtTime(Math.min(vol, Math.max(0.0001, s.gain.gain.value)), t); // ふわっと 入っている 途中でも、今の 大きさから
          s.gain.gain.linearRampToValueAtTime(0.0001, t + f);
        }
        s.src.stop(t + f + 0.02);
      } catch {
        cleanup();
      }
    },
  };
}

/**
 * 止められる 1 回きりの 音。いまは `spiralWind` だけ（かべで 消えたら stop(0.2) で 0.2 秒 いかいに 小さく して 止める）。
 * 記録は 'spiralWind'。読みこみ前は 合成音で 代わり（止められない）。音量 0・同時 3 つの 上限は playLegend と 同じ。
 */
export function startLegendOneShot(sound: Pick<SoundFx, 'playTones'>, name: 'spiralWind'): { stop(fadeSec: number): void } {
  logSound(name);
  const none = { stop(): void {} };
  const o = outputOf(sound);
  const buf = o ? bufferFor(o, LEGEND_FILES[name][0]) : null;
  if (!o || buf === null) {
    sound.playTones(LEGEND_SOUNDS[name]);
    return none;
  }
  const vol = volume();
  if (!(vol > 0) || (playing[name] ?? 0) >= LEGEND_MAX_SAME) return none;
  const s = start(o, buf, vol, false, 0);
  if (!s) return none;
  playing[name] = (playing[name] ?? 0) + 1;
  let stopped = false;
  s.src.onended = () => {
    playing[name] = Math.max(0, (playing[name] ?? 1) - 1);
    s.src.disconnect();
    s.gain.disconnect();
  };
  return {
    stop(fadeSec: number): void {
      if (stopped) return;
      stopped = true;
      try {
        const t = o.ctx.currentTime;
        const f = Math.max(0, fadeSec);
        if (f > 0) {
          s.gain.gain.cancelScheduledValues?.(t);
          s.gain.gain.setValueAtTime(vol, t);
          s.gain.gain.linearRampToValueAtTime(0.0001, t + f);
        }
        s.src.stop(t + f + 0.02);
      } catch {
        s.src.disconnect();
        s.gain.disconnect();
      }
    },
  };
}
