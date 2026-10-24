import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TUNE } from './gashaGirlTuning';
import { SFX_FILES, createGirlSfx, type SfxPlayOpts } from './gashaGirlSfx';

/** 再生関数の 偽物: 鳴らした ものを 記録する。長さは 0.5 秒 とする */
function setup(durSec = 0.5, seed = 1) {
  const log: { url: string; at: number; o: SfxPlayOpts }[] = [];
  let now = 0;
  const sfx = createGirlSfx({ now: () => now, play: (url, o) => { log.push({ url, at: now + o.delaySec, o }); return durSec; } }, TUNE.sfx, seed);
  const names = () => log.map((l) => l.url.replace(/^.*\//, '').replace('.ogg', ''));
  return { sfx, log, names, advance: (s: number) => { now += s; } };
}

describe('少女の 効果音: どの 場面で 何を 何回', () => {
  it('ファイル 17 個が public/sound/gasha/ に ある', () => {
    const all = Object.values(SFX_FILES).flat();
    expect(all.length).toBe(17);
    for (const f of all) expect(existsSync(join(process.cwd(), 'public/sound/gasha', `${f}.ogg`)), f).toBe(true);
  });
  it('パスは 相対パス（公開版で 404 に ならない）', () => {
    const { sfx, log } = setup();
    sfx.warpOut();
    expect(log[0]!.url).toBe('./sound/gasha/warp_out.ogg');
  });
  it('消える・現れる・詠唱は 1 回ずつ', () => {
    const a = setup(); a.sfx.warpOut(); expect(a.names()).toEqual(['warp_out']);
    const b = setup(); b.sfx.warpIn(); expect(b.names()).toEqual(['warp_in']);
    const c = setup(); c.sfx.cast(); expect(c.names()).toEqual(['cast']);
  });
  it('魔法 1: 予告 → 噴出（予告の 秒だけ おくれる）。輪が 3 つでも 1 回ずつ', () => {
    const { sfx, names, log } = setup();
    sfx.s1(TUNE.s1.delaySec);
    expect(names()).toEqual(['s1_warn', 's1_erupt']);
    expect(log[1]!.at).toBeCloseTo(TUNE.s1.delaySec, 5);
  });
  it('魔法 2: 渦が 9 か所でも 1 回', () => {
    const { sfx, names } = setup();
    sfx.s2Vortex();
    expect(names()).toEqual(['s2_vortex']);
  });
  it('魔法 3: 浮かぶ・発射は 3 種を 順番に、爆発は 1 つ', () => {
    const a = setup(0.01); for (let i = 0; i < 7; i++) a.sfx.s3Spawn();
    expect(a.names()).toEqual(['s3_spawn', 's3_spawn_b', 's3_spawn_c', 's3_spawn', 's3_spawn_b', 's3_spawn_c', 's3_spawn']);
    const b = setup(0.01); for (let i = 0; i < 4; i++) b.sfx.s3Fire();
    expect(b.names()).toEqual(['s3_fire', 's3_fire_b', 's3_fire_c', 's3_fire']);
    const c = setup(); c.sfx.s3Hit(); expect(c.names()).toEqual(['s3_hit']);
  });
  it('魔法 4: 16 発の 1 波で 4〜6 回に 間引く（どの 種でも）', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { sfx, names } = setup(0.7, seed);
      sfx.s4Wave(TUNE.s4.count);
      expect(names().every((n) => n === 's4_fire')).toBe(true);
      expect(names().length).toBeGreaterThanOrEqual(TUNE.sfx.s4PlaysMin);
      expect(names().length).toBeLessThanOrEqual(TUNE.sfx.s4PlaysMax);
    }
  });
  it('魔法 4: 弾が 少ない ときは 弾の 数まで', () => {
    const { sfx, names } = setup(0.7); sfx.s4Wave(2); expect(names().length).toBe(2);
  });
  it('目が 合った → 「ピピン」、頬染め → 「////」、当たった → player_hit', () => {
    const a = setup(); a.sfx.eyePipin(); expect(a.names()).toEqual(['eye_pipin']);
    const b = setup(); b.sfx.eyeBlush(); expect(b.names()).toEqual(['eye_blush']);
    const c = setup(); c.sfx.playerHit(); expect(c.names()).toEqual(['player_hit']);
  });
});

describe('少女の 効果音: ゆらぎと 同時再生', () => {
  it('毎回 ±30 cents・±1 dB の はんいで ゆらぐ（ばらつきも ある）', () => {
    const { sfx, log, advance } = setup(0.01, 7);
    for (let i = 0; i < 200; i++) { sfx.play('eye_pipin'); advance(1); }
    const cents = log.map((l) => 1200 * Math.log2(l.o.rate));
    const db = log.map((l) => 20 * Math.log10(l.o.gain));
    expect(Math.max(...cents)).toBeLessThanOrEqual(TUNE.sfx.detuneCents + 1e-6);
    expect(Math.min(...cents)).toBeGreaterThanOrEqual(-TUNE.sfx.detuneCents - 1e-6);
    expect(Math.max(...cents) - Math.min(...cents)).toBeGreaterThan(30);
    expect(Math.max(...db)).toBeLessThanOrEqual(TUNE.sfx.gainDb + 1e-6);
    expect(Math.min(...db)).toBeGreaterThanOrEqual(-TUNE.sfx.gainDb - 1e-6);
    expect(Math.max(...db) - Math.min(...db)).toBeGreaterThan(0.5);
  });
  it('おなじ 種の 乱数は 同じ（シード付き）', () => {
    const a = setup(0.5, 5), b = setup(0.5, 5);
    for (const t of [a, b]) { t.sfx.play('cast'); t.sfx.s4Wave(16); }
    expect(a.log.map((l) => l.o)).toEqual(b.log.map((l) => l.o));
  });
  it('同じ 音の 同時再生は 3 まで（4 つめは 鳴らさない。おわれば また 鳴る）', () => {
    const { sfx, log, advance } = setup(1.0);
    expect([1, 2, 3, 4].map(() => sfx.play('cast'))).toEqual([true, true, true, false]);
    expect(log.length).toBe(3);
    advance(1.01);
    expect(sfx.play('cast')).toBe(true);
  });
  it('3 種を 順番に 使う 音は ファイルごとに 数える（20 連射でも 鳴る）', () => {
    const { sfx, log, advance } = setup(0.2);
    for (let i = 0; i < 20; i++) { sfx.s3Fire(); advance(TUNE.s3.shotGap); }
    expect(log.length).toBe(20);
  });
  it('s4 は 間引いた 回数を ずらして 鳴らし、3 つまでに おさまる', () => {
    const { sfx, log } = setup(0.7, 3);
    sfx.s4Wave(16);
    const starts = log.map((l) => l.at);
    for (const s of starts) expect(starts.filter((x) => x <= s + 1e-9 && s < x + 0.7 - 1e-9).length).toBeLessThanOrEqual(TUNE.sfx.maxSame);
  });
  it('音量 0 なら 鳴らさない', () => {
    const log: string[] = [];
    const sfx = createGirlSfx({ now: () => 0, play: (u) => { log.push(u); return 1; } }, { ...TUNE.sfx, volume: 0 }, 1);
    expect(sfx.play('cast')).toBe(false);
    expect(log.length).toBe(0);
  });
  it('ファイルが まだ 読めて いない（再生関数が 0 を 返す）ときは 鳴った 数に 入れない', () => {
    const sfx = createGirlSfx({ now: () => 0, play: () => 0 }, TUNE.sfx, 1);
    for (let i = 0; i < 5; i++) expect(sfx.play('cast')).toBe(false);
  });
});
