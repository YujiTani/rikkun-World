import { describe, expect, it } from 'vitest';
import { TUNE as T } from './gashaBigTuning';
import { GeyserField, apexOf, cycleOf, geyserPhase, hash01, nominalCycle, type FieldDeps, type GeyserPlaceArgs } from './gashaGeyserField';

const A: GeyserPlaceArgs = { x: 0, y: 11, z: 0, yaw: 0.4, scale: 0.465 };
const DT = 1 / 60;

/** 平らな 草原（地面の 高さ 10）の にせの ワールドと プレイヤー */
function make(player = { x: 500, y: 11, z: 500 }, bodySolid: FieldDeps['bodySolid'] = () => false) {
  const blocks = new Map<string, string>();
  const calls = { vel: [] as { x: number; y: number; z: number }[], noFall: [] as boolean[], nudge: 0 };
  const vel = { x: 0, y: 0, z: 0 };
  const deps: FieldDeps = {
    groundY: () => 10,
    blockAt: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? (y > 10 ? 'air' : y === 10 ? 'grass' : 'dirt'),
    setBlock: (x, y, z, id) => { blocks.set(`${x},${y},${z}`, id); return true; },
    restoreBlock: (x, y, z, id) => { blocks.set(`${x},${y},${z}`, id); return true; },
    scanBlocks: (found) => { for (const [k, v] of blocks) if (v === 'geyser_dirt') { const [x, y, z] = k.split(',').map(Number); found(x!, y!, z!); } },
    bodySolid,
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
    w.run(S.crackSec + 2 + T.geyser.staggerSec);
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
    w.run(1.5);
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

  it('柱は 15 秒ほどの くり返し: ふき出す（1 秒で 10 マス）→ そのまま → 5 秒かけて 小さく なる → また ふき出す', () => {
    const R = T.geyser;
    expect(R.visualHeight).toBe(10);
    expect(nominalCycle(R)).toBeCloseTo(15, 6);
    expect(R.riseSec).toBe(1);
    expect(geyserPhase(-1).state).toBe('wait');
    expect(geyserPhase(0)).toMatchObject({ state: 'rising', frac: 0 });
    const half = geyserPhase(R.riseSec / 2);
    expect(half.state).toBe('rising');
    expect(half.frac).toBeGreaterThan(0.4);
    expect(half.frac).toBeLessThan(1);
    expect(geyserPhase(R.riseSec + 0.01)).toMatchObject({ state: 'up', frac: 1 });
    expect(geyserPhase(5)).toMatchObject({ state: 'up', frac: 1 });
    expect(geyserPhase(9.99)).toMatchObject({ state: 'up', frac: 1 });
    expect(geyserPhase(10.01).state).toBe('shrinking');
    // 小さく なる: だんだん ひくく（10 秒 → 15 秒）
    let prev = 1;
    for (let t = 10.1; t < 15; t += 0.1) { const f = geyserPhase(t).frac; expect(f).toBeLessThanOrEqual(prev + 1e-9); prev = f; }
    expect(geyserPhase(12.5).frac).toBeCloseTo((1 + R.shrinkTo) / 2, 1);
    expect(geyserPhase(14.99).frac).toBeCloseTo(R.shrinkTo, 1);
    // 15 秒で また ふき出す（小さい 状態から 1 秒で もとの 高さへ）
    expect(geyserPhase(15.0).state).toBe('rising');
    expect(geyserPhase(15.0).frac).toBeCloseTo(R.shrinkTo, 2);
    expect(geyserPhase(16.01)).toMatchObject({ state: 'up', frac: 1 });
    expect(geyserPhase(30.01).state).toBe('rising'); // 2 まわり目
  });

  it('1 本ごとに くり返しの 長さと 始まりが ずれる（いっせいに ふき出さない）', () => {
    const R = T.geyser;
    const cycles = new Set<number>(), shifts: number[] = [];
    for (let i = 0; i < 40; i++) {
      const x = 100 + i * 7, z = 300 - i * 3;
      const c = cycleOf(x, z, R);
      expect(c).toBeGreaterThanOrEqual(nominalCycle(R) * (1 - R.cycleJitter) - 1e-9);
      expect(c).toBeLessThanOrEqual(nominalCycle(R) * (1 + R.cycleJitter) + 1e-9);
      cycles.add(Math.round(c * 100));
      shifts.push(hash01(x, z, 3) * R.staggerSec);
    }
    expect(cycles.size).toBeGreaterThan(30);
    expect(Math.max(...shifts) - Math.min(...shifts)).toBeGreaterThan(R.staggerSec * 0.6);
    // 伸びる 時間と 小さくなる 時間は ずれても かわらない（ずれは そのままの 時間で 合わせる）
    const c = cycleOf(123, 456, R);
    expect(geyserPhase(R.riseSec + 0.01, c).state).toBe('up');
    expect(geyserPhase(c - R.shrinkSec + 0.01, c).state).toBe('shrinking');
    expect(geyserPhase(c - 0.01, c).state).toBe('shrinking');
  });

  it('見た目の 高さは 時間で かわるが、打ち上げる 高さ（top）と 打ち上げは いつも おなじ（小さい ときも 肩の 雲の 上まで）', () => {
    const R = T.geyser;
    const w = make({ x: 0, y: 11, z: 0 });
    w.f.place(A);
    w.run(S.crackSec + 1);
    const base = w.f.info().filter((g) => g.state !== 'cracking');
    expect(base.length).toBe(2);
    const g0 = base[0]!;
    const tops = new Set<number>(), visTops: number[] = [], states = new Set<string>();
    const apex0 = apexOf({ top: g0.top });
    expect(apex0 - (g0.ground - 1)).toBeGreaterThanOrEqual(17 + 2 - 1); // 肩の 雲の 上 + 2
    let minLiftVy = Infinity, seenUp = false;
    for (let i = 0; i < 60 * 40; i++) {
      w.f.step(DT);
      const g = w.f.info().find((q) => q.x0 === g0.x0 && q.z0 === g0.z0)!;
      tops.add(g.top); states.add(g.state); visTops.push(g.visTop - g.ground);
      expect(g.visTop - g.ground).toBeLessThanOrEqual(R.visualHeight + 1e-9);
      if (g.state === 'up') seenUp = true;
      if (g.state === 'wait' || (g.state === 'rising' && !seenUp)) continue; // わき出す 前・さいしょの ふき出しの はじめは まだ 打ち上げない
      // どの 時間でも 柱に 入れば 上へ（小さい ときも）
      if (i % 25 === 0) {
        w.player.x = g.x; w.player.z = g.z; w.player.y = g.ground; w.vel.y = 0;
        const n = w.calls.vel.length;
        w.f.step(DT);
        expect(w.calls.vel.length).toBeGreaterThan(n);
        minLiftVy = Math.min(minLiftVy, w.calls.vel.at(-1)!.y);
        expect(w.calls.noFall.at(-1)).toBe(true);
        w.player.x = 500; w.player.z = 500;
        w.f.step(DT);
      }
    }
    expect([...tops]).toEqual([g0.top]); // 打ち上げる 高さは ずっと おなじ
    expect(minLiftVy).toBeGreaterThan(0);
    expect(states.has('rising') || states.has('up')).toBe(true);
    expect(states.has('shrinking')).toBe(true);
    // 見た目は 10 マスまで 伸びて、小さく なる
    expect(Math.max(...visTops)).toBeCloseTo(R.visualHeight, 3);
    expect(Math.min(...visTops)).toBeLessThan(R.visualHeight * 0.5);
  });

  it('小さく なっている 柱の 上から 落ちても 守りが 効く（ゆっくり おりて 落下ダメージなし）', () => {
    const R = T.geyser;
    const w = make({ x: 0, y: 11, z: 0 });
    w.f.place(A);
    w.run(S.crackSec + 1);
    const g0 = w.f.info().find((q) => q.state !== 'cracking')!;
    // 小さく なる 時間まで すすめる
    for (let i = 0; i < 60 * 40; i++) { w.f.step(DT); const g = w.f.info().find((q) => q.x0 === g0.x0 && q.z0 === g0.z0)!; if (g.state === 'shrinking' && g.grow < 0.5) break; }
    const g = w.f.info().find((q) => q.x0 === g0.x0 && q.z0 === g0.z0)!;
    expect(g.state).toBe('shrinking');
    w.player.x = g.x; w.player.z = g.z; w.player.y = g.top - 1; w.vel.y = -20; // 柱の 上の ほうから 落ちて きた
    w.f.step(DT);
    expect(w.calls.vel.at(-1)!.y).toBeGreaterThanOrEqual(-R.slowFall - 1e-9);
    expect(w.calls.noFall.at(-1)).toBe(true);
  });
});

describe('GeyserField: 自分が 作った つちを 片づけで もどす・数えなおしの はんい（FIX-BRIEF-2 §3-5）', () => {
  const S = T.geyser.spawn;

  it('片づける(dismiss)と、自分が 作った つちは もとの ブロックに もどる。掘られた ところ・プレイヤーが 置いた つちは さわらない', () => {
    const w = make({ x: 0, y: 11, z: 0 });
    w.f.place(A);
    w.run(S.crackSec + 2 + T.geyser.staggerSec);
    expect(w.dirtCells()).toBe(8);
    // 1 マス 掘る(空気)・プレイヤーが 遠くに 置いた つち
    w.dig(1);
    w.blocks.set('300,10,300', 'geyser_dirt');
    w.f.dismiss();
    expect(w.dirtCells()).toBe(1); // プレイヤーが 置いた 1 つだけ のこる
    expect(w.blocks.get('300,10,300')).toBe('geyser_dirt');
    // もどった 場所は もとの 草(grass)
    const back = [...w.blocks.entries()].filter(([, v]) => v === 'grass');
    expect(back.length).toBe(7);
    expect([...w.blocks.values()].filter((v) => v === 'air').length).toBe(1); // 掘られた ところは そのまま
  });

  it('次の ボスの 数えなおしは 古い つちを 拾わない（前の ボスの つちは 片づけで もどって いる)', () => {
    const w = make({ x: 0, y: 11, z: 0 });
    w.f.place(A);
    w.run(S.crackSec + 2 + T.geyser.staggerSec);
    w.f.dismiss();
    expect(w.dirtCells()).toBe(0);
    w.f.place({ ...A, x: 30 });
    expect(w.f.pending().length).toBe(2); // ひびから(古い つちは 柱に ならない)
    expect(w.f.groupCount()).toBe(2);
  });

  it('数えなおしは ボスから rescanRadius ブロックの 中だけ: 遠くの つちは 柱に しない', () => {
    const w = make({ x: 0, y: 11, z: 0 });
    w.blocks.set('20,10,20', 'geyser_dirt');
    w.blocks.set(`${T.geyser.rescanRadius + 50},10,0`, 'geyser_dirt');
    w.f.place(A);
    w.run(0.5);
    expect(w.f.specs().length).toBe(1); // 近い 1 つだけ
    expect(w.f.specs()[0]!.x0).toBe(20);
  });
});

describe('GeyserField（体・ガラスの 下では 打ち上げない。#293 直し 4）', () => {
  const S = T.geyser.spawn;

  it('天井が なければ(割れて 通れる)これまで どおり 打ち上げる。調整表 blockedByBody を false に すれば 天井が あっても 打ち上げる', () => {
    const solid = (x: number, y: number, z: number): boolean => y === 15 && Math.abs(x) <= 40 && Math.abs(z) <= 40;
    let on = true;
    const w = make({ x: 0, y: 11, z: 0 }, (x, y, z) => on && solid(x, y, z));
    w.f.place(A);
    w.run(S.crackSec + 2 + T.geyser.staggerSec);
    const g = w.f.info().find((q) => q.state === 'up')!;
    w.player.x = g.x; w.player.z = g.z; w.player.y = g.ground;
    w.run(0.2);
    expect(w.calls.vel.length, '天井の 下では 打ち上げない').toBe(0);
    expect(w.calls.nudge, '横に 押しもどさない').toBe(0);
    expect(w.calls.noFall.filter((x) => x), '柱の 中の 守りも かけない').toEqual([]);
    on = false;
    w.run(0.2);
    expect(w.calls.vel.at(-1)!.y, '天井が なくなれば 打ち上げる').toBeGreaterThan(0);
    on = true;
    const saved = T.geyser.blockedByBody;
    T.geyser.blockedByBody = false;
    const n = w.calls.vel.length;
    w.run(0.2);
    T.geyser.blockedByBody = saved;
    expect(w.calls.vel.length, 'false なら 天井が あっても 打ち上げる').toBeGreaterThan(n);
  });
});
