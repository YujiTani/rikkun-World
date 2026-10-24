import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TUNE as T } from './gashaBigTuning';
import { BIG_FILES, bigSfxUrl, createBigSfx, type BigLoop, type BigSfxEnv, type BigSfxName } from './gashaBigSfx';
import type { SfxPlayOpts } from './gashaBigSfxPlayer';

/** 鳴らす 口の 偽物: 鳴らした ものと ループの 入り・切れを 記録する */
function setup(durSec = 0.5, loaded = true) {
  const log: { url: string; at: number; o: SfxPlayOpts }[] = [];
  const loops: { url: string; gain: number; fadeIn: number; stopped: number | null }[] = [];
  let now = 0, ready = loaded;
  const env: BigSfxEnv = {
    now: () => now,
    play: (url, o) => { log.push({ url, at: now + o.delaySec, o }); return durSec; },
    loop: (url, gain, fadeIn): BigLoop | null => {
      if (!ready) return null;
      const l = { url, gain, fadeIn, stopped: null as number | null };
      loops.push(l);
      return { stop: (f) => { l.stopped = f; } };
    },
  };
  const sfx = createBigSfx(env, T.sfx, 1);
  const names = () => log.map((l) => l.url.replace(/^.*\//, '').replace(/\.(ogg|wav)$/, ''));
  return { sfx, log, loops, names, advance: (s: number) => { now += s; }, ready: (v: boolean) => { ready = v; } };
}

describe('大きな姿の 効果音（#293）', () => {
  it('調整表の 音は ぜんぶ ファイルが ある（ふつうは ogg、ループは wav）', () => {
    for (const [name, d] of Object.entries(BIG_FILES)) {
      expect(name in T.sfx.gain, name).toBe(true);
      for (const f of d.files) expect(existsSync(join(process.cwd(), 'public/sound/gasha/big', `${f}.${d.ext}`)), f).toBe(true);
      expect(d.ext).toBe(d.loop ? 'wav' : 'ogg');
    }
    for (const k of Object.keys(T.sfx.gain)) expect(k in BIG_FILES, k).toBe(true);
  });
  it('tired_* の 音は 使わない', () => {
    expect(Object.values(BIG_FILES).flatMap((d) => d.files).some((f) => f.startsWith('tired'))).toBe(false);
  });
  it('パスは 相対パス', () => {
    expect(bigSfxUrl('a1_slam', 'ogg')).toBe('./sound/gasha/big/a1_slam.ogg');
    const { sfx, log } = setup();
    sfx.slam();
    expect(log[0]!.url).toBe('./sound/gasha/big/a1_slam.ogg');
  });
  it('攻撃 1: 持ち上げ → 着く → ゴゴゴ（ループ）。体の 上の 押しは 3 種を 順番に', () => {
    const { sfx, names, loops } = setup();
    sfx.lift(); sfx.slam(); sfx.quakeOn();
    expect(names()).toEqual(['a1_lift', 'a1_slam']);
    expect(loops.map((l) => l.url)).toEqual(['./sound/gasha/big/a1_quake.wav']);
    expect(loops[0]!.fadeIn).toBe(T.sfx.quakeFadeInSec);
    const b = setup();
    for (let i = 0; i < 4; i++) { b.sfx.shake(); b.advance(1); }
    expect(b.names()).toEqual(['a1_shake', 'a1_shake_b', 'a1_shake_c', 'a1_shake']);
  });
  it('攻撃 2: 振りかぶり → 1 回目 → 2 回目', () => {
    const { sfx, names } = setup();
    sfx.windup(); sfx.sweep(0); sfx.sweep(1);
    expect(names()).toEqual(['a2_windup', 'a2_sweep', 'a2_sweep_b']);
  });
  it('攻撃 3: 予兆 → 光線が 出る（ループ）→ 終わりに 煙', () => {
    const { sfx, names, loops } = setup();
    sfx.omen(); sfx.beamOn(); sfx.beamLoopOn();
    expect(names()).toEqual(['a3_omen', 'a3_beam_on']);
    expect(loops[0]!.url).toBe('./sound/gasha/big/a3_beam_loop.wav');
    sfx.beamLoopOff(); sfx.smoke();
    expect(loops[0]!.stopped).toBe(T.sfx.beamLoopFadeOutSec);
    expect(names()).toEqual(['a3_omen', 'a3_beam_on', 'a3_smoke']);
  });
  it('前進の 一歩: 3 種を 順番に', () => {
    const { sfx, names, advance } = setup();
    for (let i = 0; i < 3; i++) { sfx.step(); advance(2); }
    expect(names()).toEqual(['step_slam', 'step_slam_b', 'step_slam_c']);
  });
  it('音量: 調整表の volume × gain。0 なら 鳴らさない。同じ 音は maxSame まで', () => {
    const a = setup();
    a.sfx.slam();
    expect(a.log[0]!.o.gain).toBeGreaterThan(Math.pow(10, -T.sfx.gainDb / 20) * 0.999);
    expect(a.log[0]!.o.gain).toBeLessThan(Math.pow(10, T.sfx.gainDb / 20) * 1.001);
    const saved = T.sfx.gain.a1_slam;
    T.sfx.gain.a1_slam = 0;
    try { const b = setup(); expect(b.sfx.slam()).toBe(false); expect(b.log.length).toBe(0); } finally { T.sfx.gain.a1_slam = saved; }
    const c = setup(1);
    const ok = [0, 1, 2, 3, 4].map(() => c.sfx.slam());
    expect(ok.filter(Boolean).length).toBe(T.sfx.maxSame);
  });
  it('ループは 二重に 始まらない。止める と 切れる。まだ 読めて いなければ update で あとから 始まる', () => {
    const { sfx, loops, ready } = setup(0.5, false);
    sfx.beamLoopOn();
    expect(loops.length).toBe(0);
    ready(true);
    sfx.update();
    sfx.update();
    sfx.beamLoopOn();
    expect(loops.length).toBe(1);
    sfx.beamLoopOff();
    sfx.update();
    expect(loops[0]!.stopped).toBe(T.sfx.beamLoopFadeOutSec);
    expect(sfx.activeLoops()).toEqual([]);
    sfx.beamLoopOn();
    expect(loops.length).toBe(2);
  });
  it('音の 名前は 調整表と そろって いる', () => {
    const n: BigSfxName[] = ['a1_lift', 'a3_omen'];
    expect(n.every((k) => k in T.sfx.gain)).toBe(true);
  });
});
