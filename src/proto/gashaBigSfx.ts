/**
 * #293 試作: 大きな 姿の 効果音（オーナーが OK した sfx-big-v1 から 組み込んだ 分。public/sound/gasha/big/。出どころは そこの README.md）。
 *  ・どの 場面で 何を 鳴らすかは ここ（`createBigSfx` の 口）。数（音量・ゆらぎ・フェード）は gashaBigTuning.ts の sfx。
 *  ・少女の gashaGirlSfx.ts と おなじ しくみ（鳴らす 口 `BigSfxEnv` は 差しかえ できる。テストでは 偽物で 数える）。ループ（ゴゴゴ・光線）は wav（ogg は つなぎ目で 切れる）。
 *  ・読めて いない 間は 鳴らさない（ループは 読めたら あとから 始まる）。tired_* は 使わない。
 */
import { TUNE as T } from './gashaBigTuning';
import { createWebAudioPlayerBase, type SfxEnv } from './gashaBigSfxPlayer';

export type BigSfxName = keyof typeof T.sfx.gain;

interface FileDef { files: readonly string[]; ext: 'ogg' | 'wav'; loop?: true }
const one = (f: string, ext: 'ogg' | 'wav' = 'ogg', loop?: true): FileDef => ({ files: [f], ext, ...(loop ? { loop } : {}) });
/** 音ごとの ファイル（複数は 順番に 使う） */
export const BIG_FILES: Record<BigSfxName, FileDef> = {
  a1_lift: one('a1_lift'),
  a1_slam: one('a1_slam'),
  a1_quake: one('a1_quake', 'wav', true),
  a1_shake: { files: ['a1_shake', 'a1_shake_b', 'a1_shake_c'], ext: 'ogg' },
  a2_windup: one('a2_windup'),
  a2_sweep: one('a2_sweep'),
  a2_sweep_b: one('a2_sweep_b'),
  a3_omen: one('a3_omen'),
  a3_beam_on: one('a3_beam_on'),
  a3_beam_loop: one('a3_beam_loop', 'wav', true),
  a3_smoke: one('a3_smoke'),
  a4_inhale: one('a4_inhale'),
  a4_erupt: one('a4_erupt'),
  a4_ash: { files: ['a4_ash', 'a4_ash_b', 'a4_ash_c'], ext: 'ogg' },
  a4_embers: one('a4_embers', 'wav', true),
  a4_embers_b: one('a4_embers_b', 'wav', true),
  a5_cloud: one('a5_cloud'),
  a5_strike: one('a5_strike'),
  a5_elec: one('a5_elec', 'wav', true),
  a5_bolt: { files: ['a5_bolt', 'a5_bolt_b', 'a5_bolt_c'], ext: 'ogg' },
  step_slam: { files: ['step_slam', 'step_slam_b', 'step_slam_c'], ext: 'ogg' },
};
const DIR = './sound/gasha/big/';
export const bigSfxUrl = (file: string, ext: 'ogg' | 'wav'): string => `${DIR}${file}.${ext}`;
export const allBigSfxUrls = (): string[] => Object.values(BIG_FILES).flatMap((d) => d.files.map((f) => bigSfxUrl(f, d.ext)));

/** 鳴り つづけて いる ループ 1 つ（止めると 秒かけて 小さく なって 切れる） */
export interface BigLoop { stop(fadeOutSec: number): void }
export interface BigSfxEnv extends SfxEnv {
  /** ループを 始める（fadeInSec かけて 入る）。まだ 読めて いなければ null */
  loop(url: string, gain: number, fadeInSec: number): BigLoop | null;
}
type SfxTune = typeof T.sfx;

const mulberry = (s: number) => () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function createBigSfx(env: BigSfxEnv, tune: SfxTune = T.sfx, seed = 294) {
  const rnd = mulberry(seed);
  const turn: Partial<Record<BigSfxName, number>> = {};
  const active = new Map<string, { s: number; e: number }[]>();
  const counts: Partial<Record<BigSfxName, number>> = {};
  /** ループ: 鳴らしたい か（want）・鳴って いる もの（h）・止める ときの フェード */
  const loops = new Map<BigSfxName, { want: boolean; h: BigLoop | null; fadeIn: number; fadeOut: number }>();

  /** 1 回 鳴らす。鳴らせたら true（volume 0・同時 maxSame・ファイル未読みこみは false） */
  function play(name: BigSfxName, delaySec = 0): boolean {
    const vol = tune.volume * tune.gain[name];
    if (!(vol > 0)) return false;
    const def = BIG_FILES[name];
    const i = turn[name] ?? 0;
    turn[name] = (i + 1) % def.files.length;
    const url = bigSfxUrl(def.files[i]!, def.ext);
    const start = env.now() + delaySec;
    const list = (active.get(url) ?? []).filter((x) => x.e > start - 1e-9 || x.s > start);
    const cap = name === 'a4_ash' ? tune.ashMaxSame : tune.maxSame; // 灰は 小さく たくさん 重なる
    if (list.filter((x) => x.s <= start + 1e-9 && start < x.e - 1e-9).length >= cap) { active.set(url, list); return false; }
    const cents = (rnd() * 2 - 1) * tune.detuneCents, db = (rnd() * 2 - 1) * tune.gainDb;
    const dur = env.play(url, { gain: vol * Math.pow(10, db / 20), rate: Math.pow(2, cents / 1200), delaySec });
    if (!(dur > 0)) { active.set(url, list); return false; }
    list.push({ s: start, e: start + dur });
    active.set(url, list);
    counts[name] = (counts[name] ?? 0) + 1;
    return true;
  }

  const tryStart = (name: BigSfxName, l: { h: BigLoop | null; fadeIn: number }): void => {
    const vol = tune.volume * tune.gain[name];
    if (!(vol > 0) || l.h) return;
    const def = BIG_FILES[name];
    l.h = env.loop(bigSfxUrl(def.files[0]!, def.ext), vol, l.fadeIn);
  };
  /** ループを 鳴らし はじめる（もう 鳴らして いれば 何も しない） */
  function loopOn(name: BigSfxName, fadeInSec: number, fadeOutSec: number): void {
    const l = loops.get(name) ?? { want: false, h: null, fadeIn: fadeInSec, fadeOut: fadeOutSec };
    l.want = true; l.fadeIn = fadeInSec; l.fadeOut = fadeOutSec;
    loops.set(name, l);
    tryStart(name, l);
  }
  /** ループを 止める（fadeOutSec かけて 小さく して 切る。鳴って いなければ 何も しない） */
  function loopOff(name: BigSfxName): void {
    const l = loops.get(name);
    if (!l) return;
    l.want = false;
    if (l.h) { l.h.stop(l.fadeOut); l.h = null; }
    loops.delete(name);
  }

  return {
    play,
    counts: () => ({ ...counts }),
    /** 鳴らしたい ループの 名前（まだ 読めて いなくても ふくむ） */
    activeLoops: (): BigSfxName[] => [...loops.keys()],
    /** 毎コマ: まだ 読めて いなかった ループを 読めたら 始める */
    update: () => { for (const [n, l] of loops) if (l.want) tryStart(n, l); },
    /** 全部 止める（体が 作りなおされた とき など） */
    stopAll: () => { for (const n of [...loops.keys()]) loopOff(n); },
    lift: () => play('a1_lift'),
    slam: () => play('a1_slam'),
    quakeOn: () => loopOn('a1_quake', tune.quakeFadeInSec, tune.quakeFadeOutSec),
    quakeOff: () => loopOff('a1_quake'),
    shake: () => play('a1_shake'),
    windup: () => play('a2_windup'),
    /** 払い: 0 = 1 回目、1 = 2 回目 */
    sweep: (i: number) => play(i === 0 ? 'a2_sweep' : 'a2_sweep_b'),
    omen: () => play('a3_omen'),
    beamOn: () => play('a3_beam_on'),
    beamLoopOn: () => loopOn('a3_beam_loop', tune.beamLoopFadeInSec, tune.beamLoopFadeOutSec),
    beamLoopOff: () => loopOff('a3_beam_loop'),
    smoke: () => play('a3_smoke'),
    inhale: () => play('a4_inhale'),
    erupt: () => play('a4_erupt'),
    /** 灰が 1 つ 落ちた */
    ash: () => play('a4_ash'),
    /** 燃え残りの ぱちぱち: n = 燃えかすの 数。0 で 消える。多いと 別の 録音も 重ねる */
    embers: (n: number) => {
      if (n > 0) loopOn('a4_embers', tune.emberFadeInSec, tune.emberFadeOutSec); else loopOff('a4_embers');
      if (n >= tune.emberManyAt) loopOn('a4_embers_b', tune.emberFadeInSec, tune.emberFadeOutSec); else loopOff('a4_embers_b');
    },
    /** 空が 雷雲に なる */
    cloud: () => play('a5_cloud'),
    /** 指への 落雷 */
    strike: () => play('a5_strike'),
    /** 体を 走る 電気（ループ） */
    elecOn: () => loopOn('a5_elec', tune.elecFadeInSec, tune.elecFadeOutSec),
    elecOff: () => loopOff('a5_elec'),
    /** まわりの 落雷 1 回（3 種を 順番に） */
    bolt: () => play('a5_bolt'),
    step: () => play('step_slam'),
  };
}
export type BigSfx = ReturnType<typeof createBigSfx>;

/** 本物の 鳴らす 口（WebAudio）。初めて 呼ばれたとき ファイルを 全部 読みこむ。読めない 所でも 動く */
export function createBigWebAudioPlayer(): BigSfxEnv & { preload(): void } {
  const base = createWebAudioPlayerBase(allBigSfxUrls);
  return {
    preload: base.preload,
    now: base.now,
    play: base.play,
    loop: (url, gain, fadeInSec) => {
      const c = base.context(), buf = base.buffer(url);
      if (!c || !buf) return null;
      try {
        if (c.state === 'suspended') void c.resume();
        const src = c.createBufferSource(), g = c.createGain();
        src.buffer = buf; src.loop = true;
        const t0 = c.currentTime;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(gain, t0 + Math.max(0.01, fadeInSec));
        src.connect(g); g.connect(c.destination);
        src.start(t0);
        return {
          stop: (fadeOutSec: number) => {
            try {
              const t = c.currentTime, f = Math.max(0.02, fadeOutSec);
              g.gain.cancelScheduledValues(t);
              g.gain.setValueAtTime(g.gain.value, t);
              g.gain.linearRampToValueAtTime(0, t + f);
              src.stop(t + f + 0.05);
            } catch { /* もう 止まって いる */ }
          },
        };
      } catch { return null; }
    },
  };
}
