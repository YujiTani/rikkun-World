import { describe, expect, it } from 'vitest';
import { TUNE as T } from './gashaBigTuning';
import { GeyserField, type FieldDeps, type GeyserPlaceArgs } from './gashaGeyserField';

const A: GeyserPlaceArgs = { x: 0, y: 11, z: 0, yaw: 0.4, scale: 0.465 };
const DT = 1 / 60;

/** 平らな 草原（地面の 高さ 10）の にせの ワールドと プレイヤー */
function make(player = { x: 500, y: 11, z: 500 }) {
  const blocks = new Map<string, string>();
  const calls = { vel: [] as { x: number; y: number; z: number }[], noFall: [] as boolean[], nudge: 0 };
  const vel = { x: 0, y: 0, z: 0 };
  const deps: FieldDeps = {
    groundY: () => 10,
    blockAt: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? (y > 10 ? 'air' : y === 10 ? 'grass' : 'dirt'),
    setBlock: (x, y, z, id) => { blocks.set(`${x},${y},${z}`, id); return true; },
    scanBlocks: (found) => { for (const [k, v] of blocks) if (v === 'geyser_dirt') { const [x, y, z] = k.split(',').map(Number); found(x!, y!, z!); } },
    bodySolid: () => false,
    centre: () => ({ x: 0, z: 0 }),
    body: () => ({ position: player, velocity: vel, onGround: false }),
    setVelocity: (v) => { calls.vel.push({ ...v }); },
    nudge: () => { calls.nudge++; },
    setNoFall: (on) => { calls.noFall.push(on); },
  };
  const f = new GeyserField(deps);
  const run = (sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) f.step(DT); };
  const dirtCells = () => [...blocks.values()].filter((v) => v === 'geyser_dirt').length;
  const dig = (n: number) => { // 間欠泉の つちを n マス 掘る（地面に もどす）
    let k = 0;
    for (const [key, v] of [...blocks]) if (v === 'geyser_dirt' && k < n) { blocks.set(key, 'air'); k++; }
  };
  return { f, blocks, calls, run, dirtCells, dig, player, vel };
}

describe('GeyserField（間欠泉の つち・かわる・数の 上限）', () => {
  const S = T.geyser.spawn;

  it('置くと 肩の 下の 2 本が ひびから はじまる: 10 秒かけて 間欠泉の つちに なり、それまでは 打ち上げない', () => {
    const w = make({ x: 0, y: 11, z: 0 });
    w.f.place(A);
    const info = w.f.info();
    expect(info.length).toBe(2);
    expect(info.every((g) => g.state === 'cracking' && g.stage === 1)).toBe(true);
    // 途中の 場所の 上に 立っていても 打ち上げない
    for (const g of info) { w.player.x = g.x; w.player.z = g.z; w.player.y = 11; w.run(1); }
    expect(w.calls.vel.length).toBe(0);
    expect(w.dirtCells()).toBe(0);
    w.run(S.crackSec * 0.4);
    expect(w.f.info().every((g) => g.stage >= 2)).toBe(true); // ひびが 進む
    expect(w.dirtCells()).toBe(0);
    w.run(S.crackSec * 0.7);
    expect(w.dirtCells()).toBe(8); // 2 本 × 4 ブロック
    const done = w.f.info().filter((g) => g.state !== 'cracking');
    expect(done.length).toBe(2);
    expect(done.every((g) => g.w === 2 && g.d === 2 && g.top === A.y + T.geyser.height && g.ground === 11)).toBe(true);
  });

  it('できた 柱に 入ると 上へ 打ち上げ、柱の 中と 着地まで 落下ダメージなし', () => {
    const w = make({ x: 0, y: 11, z: 0 });
    w.f.place(A);
    w.run(S.crackSec + 2);
    const g = w.f.info().find((q) => q.state === 'up')!;
    w.player.x = g.x; w.player.z = g.z; w.player.y = g.ground;
    w.run(0.05);
    expect(w.calls.vel.at(-1)!.y).toBeGreaterThan(0);
    expect(w.calls.noFall.at(-1)).toBe(true);
  });

  it('同時に 3 本まで: 長い 時間 回しても ふえすぎない。3 本の あいだは 作らない。掘って へれば また 作る', () => {
    const w = make();
    w.f.place(A);
    let maxG = 0;
    const times: number[] = [];
    let last = w.f.groupCount();
    for (let i = 0; i < 60 * 600; i++) {
      w.f.step(DT);
      const n = w.f.groupCount();
      maxG = Math.max(maxG, n);
      if (n > last) times.push(w.f.t);
      last = n;
    }
    expect(maxG).toBeLessThanOrEqual(S.maxGroups);
    expect(w.f.groupCount()).toBe(S.maxGroups);
    expect(w.dirtCells()).toBe(S.maxGroups * 4);
    w.dig(4); // 1 本ぶん 掘る
    w.run(1);
    expect(w.f.groupCount()).toBe(S.maxGroups - 1);
    w.run(S.intervalSec[1] + S.crackSec + 2);
    expect(w.f.groupCount()).toBe(S.maxGroups);
    expect(w.dirtCells()).toBe(S.maxGroups * 4);
  });

  it('1 か所ずつ、調整表の 間かくで かえる（最初は firstSec、あとは intervalSec）', () => {
    const w = make();
    w.f.place(A); // 肩の 2 本が まず かわりはじめる（数に ふくむ）
    const starts: number[] = [];
    let last = w.f.groupCount();
    for (let i = 0; i < 60 * 200; i++) {
      w.f.step(DT);
      const n = w.f.groupCount();
      if (n > last) starts.push(w.f.t);
      last = n;
    }
    expect(starts.length).toBe(1); // 2 本 + 1 本 = 3 本で 上限
    expect(starts[0]).toBeGreaterThanOrEqual(S.firstSec[0] - 0.05);
    expect(starts[0]).toBeLessThanOrEqual(S.firstSec[1] + 0.05);
    // 掘って あけたあとの 次の 1 本 までの 間かく
    w.dig(100);
    w.run(1);
    const t0 = w.f.t;
    const n0 = w.f.groupCount();
    let t1 = -1;
    for (let i = 0; i < 60 * 80 && t1 < 0; i++) { w.f.step(DT); if (w.f.groupCount() > n0) t1 = w.f.t; }
    expect(t1).toBeGreaterThan(0);
    expect(t1 - t0).toBeLessThanOrEqual(S.intervalSec[1] + 1);
  });

  it('決まった シードなら 同じ 場所に かわる', () => {
    const run = () => { const w = make(); w.f.place(A); w.run(120); return [...w.blocks.keys()].sort(); };
    expect(run()).toEqual(run());
  });

  it('ブロックを 置けば どこでも 柱が たち、掘れば 消える（1 マスでも 立つ）', () => {
    const w = make({ x: 30.5, y: 11, z: 30.5 });
    w.blocks.set('30,10,30', 'geyser_dirt');
    w.run(1);
    const g = w.f.info();
    expect(g.length).toBe(1);
    expect(g[0]!.w).toBe(1);
    expect(g[0]!.top).toBe(11 + T.geyser.height);
    expect(w.calls.vel.at(-1)!.y).toBeGreaterThan(0); // 1 マスの 柱でも 打ち上がる
    w.blocks.set('30,10,30', 'air');
    w.run(0.1);
    expect(w.f.info().length).toBe(0);
  });

  it('四角に そろった 4 ブロックは 1 本、ずれた 並びは 1 マスずつ', () => {
    const w = make();
    for (const [x, z] of [[40, 40], [41, 40], [40, 41], [41, 41]]) w.blocks.set(`${x},10,${z}`, 'geyser_dirt');
    w.run(1);
    expect(w.f.info().length).toBe(1);
    expect(w.f.info()[0]!.w).toBe(2);
    w.blocks.set('42,10,41', 'geyser_dirt'); // L 字（四角でない）
    w.run(1);
    expect(w.f.info().length).toBe(5);
    expect(w.f.info().every((g) => g.w === 1 && g.d === 1)).toBe(true);
  });

  it('spawnAt: 手で かえる。0 秒なら すぐ。ひびの 途中は info に 出る（state = cracking）', () => {
    const w = make();
    expect(w.f.spawnAt(60, 60, 4)).toBe(true);
    expect(w.f.info()[0]!.state).toBe('cracking');
    expect(w.f.spawnAt(60, 60, 4)).toBe(false); // かさねて かえない
    w.run(3);
    expect(w.f.info()[0]!.stage).toBeGreaterThanOrEqual(3);
    w.run(1.5);
    expect(w.dirtCells()).toBe(4);
    expect(w.f.spawnAt(80, 80, 0)).toBe(true);
    expect(w.dirtCells()).toBe(8);
  });

  it('かわる 途中で つちが 掘られたら やめる（かってに 間欠泉の つちを おかない）', () => {
    const w = make();
    w.f.spawnAt(60, 60, 4);
    w.run(1);
    w.blocks.set('61,10,61', 'air');
    w.run(4);
    expect(w.dirtCells()).toBe(0);
    expect(w.f.info().length).toBe(0);
  });
});
