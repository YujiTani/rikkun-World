/**
 * #293 試作: 少女の 効果音（オーナーが OK した 13 音 17 ファイル。public/sound/gasha/*.ogg。出どころは そこの README.md）。
 *  ・どの 場面で 何を 鳴らすかは ここ（`createGirlSfx` の 口）。数（音量・間引き・ゆらぎ）は gashaGirlTuning.ts の sfx。
 *  ・実際に 鳴らす 部分は `createWebAudioPlayer`（SfxEnv の 差しかえ口なので、テストでは 偽物で 数える）。
 *  ・読み方は public/sound/legend と 同じ（相対パスの ogg を fetch → decodeAudioData）。読めて いない 間は 鳴らさない。
 */
import { TUNE } from './gashaGirlTuning';
import { createWebAudioPlayerBase, type SfxEnv, type SfxOut, type SfxPlayOpts } from './gashaBigSfxPlayer';

export type GirlSfxName = keyof typeof TUNE.sfx.gain;

const DIR = './sound/gasha/';
/** 音ごとの ファイル（複数は 順番に 使う） */
export const SFX_FILES: Record<GirlSfxName, readonly string[]> = {
  warp_out: ['warp_out'],
  warp_in: ['warp_in'],
  cast: ['cast'],
  s1_warn: ['s1_warn'],
  s1_erupt: ['s1_erupt'],
  s2_vortex: ['s2_vortex'],
  s3_spawn: ['s3_spawn', 's3_spawn_b', 's3_spawn_c'],
  s3_fire: ['s3_fire', 's3_fire_b', 's3_fire_c'],
  s3_hit: ['s3_hit'],
  s4_fire: ['s4_fire'],
  eye_pipin: ['eye_pipin'],
  eye_blush: ['eye_blush'],
  player_hit: ['player_hit'],
};
export const sfxUrl = (file: string): string => `${DIR}${file}.ogg`;
export const allSfxUrls = (): string[] => Object.values(SFX_FILES).flat().map(sfxUrl);

export type { SfxEnv, SfxPlayOpts };
type SfxTune = typeof TUNE.sfx;

const mulberry = (s: number) => () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function createGirlSfx(env: SfxEnv, tune: SfxTune = TUNE.sfx, seed = 293) {
  const rnd = mulberry(seed);
  const turn: Partial<Record<GirlSfxName, number>> = {};
  /** ファイルごとの 鳴っている 間（はじまり・おわり） */
  const active = new Map<string, { s: number; e: number }[]>();
  const counts: Partial<Record<GirlSfxName, number>> = {};

  /** 1 回 鳴らす。鳴らせたら true（volume 0・同時 maxSame・ファイル未読みこみは false） */
  function play(name: GirlSfxName, delaySec = 0): boolean {
    const t = tune;
    const vol = t.volume * t.gain[name];
    if (!(vol > 0)) return false;
    const files = SFX_FILES[name];
    const i = turn[name] ?? 0;
    turn[name] = (i + 1) % files.length;
    const url = sfxUrl(files[i]!);
    const start = env.now() + delaySec;
    const list = (active.get(url) ?? []).filter((x) => x.e > start - 1e-9 || x.s > start);
    if (list.filter((x) => x.s <= start + 1e-9 && start < x.e - 1e-9).length >= t.maxSame) { active.set(url, list); return false; }
    const cents = (rnd() * 2 - 1) * t.detuneCents, db = (rnd() * 2 - 1) * t.gainDb;
    const rate = Math.pow(2, cents / 1200);
    const dur = env.play(url, { gain: vol * Math.pow(10, db / 20), rate, delaySec });
    if (!(dur > 0)) { active.set(url, list); return false; }
    list.push({ s: start, e: start + dur });
    active.set(url, list);
    counts[name] = (counts[name] ?? 0) + 1;
    return true;
  }

  return {
    play,
    /** 鳴らした 回数（名前ごと） */
    counts: () => ({ ...counts }),
    warpOut: () => play('warp_out'),
    warpIn: () => play('warp_in'),
    cast: () => play('cast'),
    /** 魔法 1: 予告の 輪 → eruptDelaySec 後に 噴出。輪が いくつでも 1 回ずつ */
    s1: (eruptDelaySec: number) => { play('s1_warn'); play('s1_erupt', eruptDelaySec); },
    /** 魔法 2: 渦が 9 か所でも 1 回 */
    s2Vortex: () => play('s2_vortex'),
    s3Spawn: () => play('s3_spawn'),
    s3Fire: () => play('s3_fire'),
    s3Hit: () => play('s3_hit'),
    /** 魔法 4: 弾が bullets 発でも 1 波で s4PlaysMin〜Max 回に 間引き、s4SpreadSec ずつ ずらして 鳴らす。鳴らした 回数を 返す */
    s4Wave: (bullets: number): number => {
      const lo = Math.max(1, Math.round(tune.s4PlaysMin)), hi = Math.max(lo, Math.round(tune.s4PlaysMax));
      const n = Math.min(Math.max(0, Math.floor(bullets)), lo + Math.floor(rnd() * (hi - lo + 1)));
      let played = 0;
      for (let k = 0; k < n; k++) if (play('s4_fire', k * tune.s4SpreadSec)) played++;
      return played;
    },
    eyePipin: () => play('eye_pipin'),
    eyeBlush: () => play('eye_blush'),
    playerHit: () => play('player_hit'),
  };
}
export type GirlSfx = ReturnType<typeof createGirlSfx>;

/** 本物の 鳴らす 口（WebAudio）。初めて 呼ばれたとき ファイルを 全部 読みこむ。読めない 所でも 動く。out = ゲームの ミキサーの 効果音バス（なければ 自前） */
export function createWebAudioPlayer(out?: SfxOut): SfxEnv & { preload(): void } {
  const base = createWebAudioPlayerBase(allSfxUrls, out);
  return { preload: base.preload, now: base.now, play: base.play, stopAll: base.stopAll };
}
