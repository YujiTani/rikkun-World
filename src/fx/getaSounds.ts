import type { SoundFx, Tone } from './sound';
import { wood } from './sfxVoices';
import { FX_SETTINGS } from './config';
import { logSound } from './soundLog';
import { createRng, type Rng } from '../world/gen/random';

/**
 * SAMURAI-1 §3.3 明珍下駄の 足音 `getaStep`（カラン・コロン）。音の ファイルは public/sound/geta/（出どころは そこの README.md）。
 * 鳴らす たびに 4 つから 1 つ（続けて 同じ音は えらばない。乱数は シード付き）。ファイルが まだ 読めて いない ときだけ、下の 合成音で 代わりに する。
 * 音量は ファイルの まま（倍率 1.0。くり返す 音なので ひろう 音より 小さい）。同時に 3 つまで。ゆらぎは SOUND.md の ふつう（高さ ±40 セント・大きさ ±0.10）。
 */
export const GETA_FILES: readonly string[] = [0, 1, 2, 3].map((i) => `./sound/geta/geta_${i}.ogg`);
/** 音ファイルが 読めない ときの 代わり（0・1 = カラン、2・3 = コロン。小さく 短く） */
const GETA_FALLBACK: readonly (readonly Tone[])[] = [
  wood(1700, 1500, 0, 0.1, 0.16),
  wood(1900, 1700, 0, 0.1, 0.16),
  wood(900, 800, 0, 0.12, 0.18),
  wood(1050, 900, 0, 0.12, 0.18),
];
/** ゆらぎ（SOUND.md の ふつう 40 / 0.10 / 0.10 の うち 高さと 大きさ） */
const WOBBLE = { cents: 40, gain: 0.1 } as const;
/** ファイルは ミキサーの 前の 大きさに そろえて ある。fxVolume 0.5 の とき 倍率 1（legendSounds と 同じ） */
const FILE_GAIN_PER_VOLUME = 2;
/** 同じ 音を 重ねて 鳴らす 上限 */
const MAX_SAME = 3;

/** 4 つから 1 つ（last と 同じ 番号は 選ばない。last が null なら どれでも）。乱数は ちょうど 1 つ */
export function pickGetaVariant(rng: Rng, last: number | null): number {
  const n = GETA_FILES.length;
  if (last === null || last < 0 || last >= n) return Math.min(n - 1, Math.floor(rng() * n));
  const i = Math.min(n - 2, Math.floor(rng() * (n - 1)));
  return i >= last ? i + 1 : i;
}

interface Node {
  connect(n: unknown): unknown;
  disconnect(): void;
}
interface Src extends Node {
  buffer: unknown;
  loop: boolean;
  playbackRate?: { value: number };
  onended: null | (() => void);
  start(t?: number): void;
}
interface Gain extends Node {
  gain: { value: number; setValueAtTime(v: number, t: number): unknown };
}
interface Ctx {
  readonly currentTime: number;
  readonly state?: string;
  resume?(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  createBufferSource(): Src;
  createGain(): Gain;
}
interface Out {
  ctx: Ctx;
  destination: unknown;
}

let loader: (url: string) => Promise<ArrayBuffer> = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.arrayBuffer();
};
interface CtxState {
  buffers: Map<string, unknown>;
  loading: Promise<void> | null;
}
let states = new WeakMap<object, CtxState>();
let playing = 0;
let lastVariant: number | null = null;
let defaultRng: Rng = createRng(300);

/** テスト用: 読みこみ（fetch の 代わり）と 状態を 作りなおす */
export function resetGetaSounds(load?: (url: string) => Promise<ArrayBuffer>): void {
  if (load) loader = load;
  states = new WeakMap();
  playing = 0;
  lastVariant = null;
  defaultRng = createRng(300);
}

function outputOf(sound: unknown): Out | null {
  try {
    const t = (sound as { target?: () => Out | null }).target?.();
    if (!t || typeof t.ctx?.decodeAudioData !== 'function' || typeof t.ctx.createBufferSource !== 'function') return null;
    return t;
  } catch {
    return null;
  }
}

function load(ctx: Ctx): Promise<void> {
  let st = states.get(ctx);
  if (!st) states.set(ctx, (st = { buffers: new Map(), loading: null }));
  const s = st;
  s.loading ??= Promise.all(
    GETA_FILES.map(async (url) => {
      try {
        s.buffers.set(url, await ctx.decodeAudioData(await loader(url)));
      } catch {
        // 読めなかった: その 音は 合成音で 代わりに する
      }
    }),
  ).then(() => undefined);
  return s.loading;
}

/** 音の ファイルを 読みこむ（失敗しても reject しない）。最初の 操作の あとに 呼ぶと 最初の 1 歩から ファイルの 音が 鳴る */
export function preloadGetaSounds(sound: Pick<SoundFx, 'playTones'>): Promise<void> {
  const o = outputOf(sound);
  return o ? load(o.ctx) : Promise.resolve();
}

/** ファイルで 鳴らせたら true（同時 3 つの 上限・音量 0 の ときは 鳴らさず true） */
function playFile(sound: unknown, variant: number, rng: Rng): boolean {
  const o = outputOf(sound);
  if (!o) return false;
  void load(o.ctx);
  const buf = states.get(o.ctx)?.buffers.get(GETA_FILES[variant]!);
  if (buf === undefined) return false;
  const v = FX_SETTINGS.fxVolume;
  if (!(v > 0)) return true;
  if (playing >= MAX_SAME) return true;
  try {
    const { ctx } = o;
    if (ctx.state === 'suspended') void ctx.resume?.();
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    src.loop = false;
    if (src.playbackRate) src.playbackRate.value = 2 ** (((rng() * 2 - 1) * WOBBLE.cents) / 1200);
    gain.gain.setValueAtTime(Math.min(1, v) * FILE_GAIN_PER_VOLUME * (1 + (rng() * 2 - 1) * WOBBLE.gain), ctx.currentTime);
    src.connect(gain);
    gain.connect(o.destination);
    playing++;
    src.onended = () => {
      playing = Math.max(0, playing - 1);
      src.disconnect();
      gain.disconnect();
    };
    src.start(ctx.currentTime);
    return true;
  } catch {
    return false;
  }
}

/** 下駄の 1 歩を 鳴らす（4 つから 1 つ）。`combat.sounds()` の 名前は getaStep */
export function playGeta(sound: Pick<SoundFx, 'playTones'>, rng: Rng = defaultRng): void {
  const variant = pickGetaVariant(rng, lastVariant);
  lastVariant = variant;
  if (!playFile(sound, variant, rng)) sound.playTones(GETA_FALLBACK[variant]!);
  logSound('getaStep');
}
