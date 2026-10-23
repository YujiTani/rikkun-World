import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import climbL from './gashaBigClips/climbL.json';
import climbR from './gashaBigClips/climbR.json';
import lookBack from './gashaBigClips/lookBack.json';
import { buildBig, cellKey, voxelize, worldHits } from './gashaBig';
import { BigActor, type ActorEnv } from './gashaBigActor';
import { TUNE as T } from './gashaBigTuning';

const CLIPS = { climbL, climbR, lookBack };
const DT = 1 / 60;

interface Rig { actor: BigActor; env: ActorEnv; ply: { x: number; y: number; z: number; yawDeg: number }; carried: number[] }

/** 地面 高さ 0 の 平らな 世界。プレイヤーは 遠くに いる */
function rig(seed = 293, x = 0, z = 0, yaw = 0): Rig {
  const ply = { x: 500, y: 1, z: 500, yawDeg: 0 };
  const carried = [0, 0, 0, 0];
  const env: ActorEnv = {
    groundY: () => -1, // 立つ 面は +1 なので 地面の 高さは 0
    player: () => ply,
    carryPlayer: (dx, dy, dz, dyaw) => { ply.x += dx; ply.y += dy; ply.z += dz; ply.yawDeg += dyaw; carried[0] += dx; carried[1] += dy; carried[2] += dz; carried[3] += dyaw; },
  };
  const actor = new BigActor(buildBig(), CLIPS, env, seed);
  actor.place(x, 0, z, yaw);
  return { actor, env, ply, carried };
}
const run = (a: BigActor, sec: number): void => { for (let i = 0; i < Math.round(sec / DT); i++) a.update(DT); };

describe('gashaBigActor（#293 はって進む・目・乗っている人）', () => {
  it('当たりの 判定は voxelize と おなじ（マスごとに くらべる）', () => {
    const { actor } = rig();
    const m = actor.model;
    const cells = voxelize(worldHits(m), T.collide.margin, T.collide.topLift);
    let diff = 0, n = 0;
    for (let i = -45; i <= 45; i++) for (let k = -45; k <= 45; k++) for (let j = -2; j <= 50; j++) {
      const a = cells.has(cellKey(i, j, k)), b = actor.solid(i, j, k);
      if (a) n++;
      if (a !== b) diff++;
    }
    expect(n).toBeGreaterThan(1000);
    expect(diff).toBe(0);
  });

  it('動きの 速さと 進む 速さは 調整表どおり。ついている 手が あり、腕が とどく', () => {
    const { actor } = rig();
    expect(actor.crawlRate).toBe(T.crawl.motionRate);
    expect(actor.crawlSpeed).toBe(T.crawl.speedPerHeight * T.size.height); // 速さは 身長から 決まる
    for (const r of actor.plant) {
      expect(r.planted.Left).toBeGreaterThan(3);
      expect(r.planted.Right).toBeGreaterThan(3);
      expect(r.overreachMax).toBeLessThan(1); // 腕が とどかない のは 1 ブロック 未満
    }
  });

  it('goTo: 前へ はって 進み、着くと 止まる', () => {
    const { actor } = rig();
    actor.walk(false);
    actor.goTo(0, 4); // +z が 前
    run(actor, 0.5);
    const z0 = actor.pos.z;
    expect(actor.mode).toBe('crawl');
    run(actor, 20);
    const dz = actor.pos.z - z0;
    expect(dz).toBeGreaterThan(0);
    expect(dz / 20).toBeCloseTo(actor.crawlSpeed, 3); // 進んだ 速さ = 調整表の 速さ
    expect(Math.abs(actor.pos.x)).toBeLessThan(0.01);
    run(actor, 120);
    expect(actor.mode).toBe('idle');
    expect(Math.hypot(actor.pos.x, actor.pos.z - 4)).toBeLessThan(T.wander.arriveDist + 0.5);
  });

  it('既定の はう 速さは ゆっくり（1/10: 動き 0.05 倍、身長 30 で 毎秒 0.075 ブロック、向きを かえるのも ゆっくり）', () => {
    expect(T.crawl.motionRate).toBeLessThanOrEqual(0.05);
    expect(T.crawl.speedPerHeight * T.size.height).toBeLessThanOrEqual(0.08);
    expect(T.crawl.turnDegPerSec).toBeLessThanOrEqual(1.5);
    expect(T.lookBack.rate).toBeLessThanOrEqual(0.06);
    // 速さと 動きの 比（手の すべらない 歩幅を きめる）が 前と おなじ: 前は 毎秒 0.75 ブロック ÷ 動き 0.5 = 1.5（身長 30 で）
    expect((T.crawl.speedPerHeight * T.size.height) / T.crawl.motionRate).toBeCloseTo(1.5, 6);
  });

  it('はう クリップは 左 → 右 → 左 と かわる', () => {
    const { actor } = rig();
    actor.walk(false);
    actor.goTo(0, 400);
    const names: string[] = [];
    for (let i = 0; i < 100 * 60; i++) {
      actor.update(DT);
      const c = (actor as unknown as { player: { clip: { name: string } | null } }).player.clip;
      const n = c?.name ?? '';
      if (names[names.length - 1] !== n) names.push(n);
    }
    console.log('clips', names.join(' > '));
    expect(names.length).toBeGreaterThanOrEqual(4);
    expect(new Set(names).size).toBe(2);
    for (let i = 1; i < names.length; i++) expect(names[i]).not.toBe(names[i - 1]);
  });

  /** はいながら、ついている 手（手首が 地面の 高さに 20 コマ いじょう つづけて ある 間）の 世界での 横の 速さを 集める */
  function stanceSpeeds(actor: BigActor, warm: number, sec: number): { med: number; fastRatio: number; n: number } {
    actor.walk(false);
    actor.goTo(0, 400);
    run(actor, warm);
    const y0 = actor.model.rest.LeftHand.y * actor.model.scale; // 手首が 地面に ぺたんと ついた ときの 高さ
    const a = new Vector3(), b = new Vector3();
    const runs: [number, number][][] = [[], []];
    const speeds: number[] = [];
    let fast = 0;
    // つく・はなれる ふちは 手が 動いている ので 数えない（クリップの 0.05 秒 ぶん。動きが おそい ほど コマ数が ふえる）
    const trim = Math.max(8, Math.ceil((0.05 / actor.crawlRate) * 60));
    const flush = (k: number): void => {
      const r = runs[k]!;
      if (r.length >= 3 * trim) for (let i = trim; i < r.length - trim; i++) {
        const sp = Math.hypot(r[i]![0] - r[i - 1]![0], r[i]![1] - r[i - 1]![1]) / DT;
        speeds.push(sp);
        if (sp > actor.crawlSpeed) fast++;
      }
      runs[k] = [];
    };
    for (let i = 0; i < sec * 60; i++) {
      actor.update(DT);
      actor.model.joints.LeftHand.getWorldPosition(a); actor.model.joints.RightHand.getWorldPosition(b);
      [a, b].forEach((v, k) => { if (Math.abs(v.y - y0) < 0.05 * actor.model.scale / 0.465) runs[k]!.push([v.x, v.z]); else flush(k); });
    }
    speeds.sort((x, y) => x - y);
    return { med: speeds[Math.floor(speeds.length / 2)] ?? NaN, fastRatio: fast / Math.max(1, speeds.length), n: speeds.length };
  }

  it('ついている 手は 地面で すべらない（世界での 速さが からだの 速さの はんぶん いか）。ゆっくり でも 大きさが かわっても', () => {
    const keep = T.size.height;
    try {
      for (const h of [30, 60]) {
        T.size.height = h;
        const { actor } = rig();
        const r = stanceSpeeds(actor, 30, 90);
        console.log('height', h, 'speed', actor.crawlSpeed.toFixed(3), 'stance median', r.med.toFixed(4), 'fast', r.fastRatio.toFixed(3), 'n', r.n);
        expect(r.n).toBeGreaterThan(50);
        expect(r.med).toBeLessThan(actor.crawlSpeed * 0.5);
        expect(r.fastRatio).toBeLessThan(0.25);
      }
    } finally { T.size.height = keep; }
  });

  it('クロスフェードが こわれない: 左右の クリップを つなぐ 前後で 手首の とびが ない（1 コマの うごきが 小さい）', () => {
    const { actor } = rig();
    actor.walk(false);
    actor.goTo(0, 400);
    const a = new Vector3();
    let prev: Vector3 | null = null, lastStep = NaN, worst = 0, fastest = 0, switches = 0, lastClip = '';
    for (let i = 0; i < 100 * 60; i++) {
      actor.update(DT);
      const clip = (actor as unknown as { player: { clip: { name: string } | null } }).player.clip?.name ?? '';
      if (lastClip && clip !== lastClip) switches++;
      lastClip = clip;
      actor.model.joints.LeftHand.getWorldPosition(a);
      if (prev) {
        const step = a.distanceTo(prev);
        fastest = Math.max(fastest, step);
        if (!Number.isNaN(lastStep)) worst = Math.max(worst, Math.abs(step - lastStep)); // 1 コマごとの 速さの かわり方（とびが あれば 大きい）
        lastStep = step;
      }
      prev = a.clone();
    }
    console.log('wrist: fastest step', fastest.toFixed(4), 'worst speed change per frame', worst.toFixed(4), 'clip switches', switches);
    expect(switches).toBeGreaterThanOrEqual(3);
    expect(worst).toBeLessThan(fastest * 0.6); // 手首の 速さが 1 コマで 最大の 6 割 いじょう とぶ ことは ない（つなぎめで 位置が とぶと 1 コマぶん 大きく うごく）
  });

  it('さまよう: シードが おなじなら おなじ 道を 通る。ちがえば ちがう', () => {
    const path = (seed: number) => { const { actor } = rig(seed); run(actor, 60); return [actor.pos.x, actor.pos.z]; };
    const a = path(1), b = path(1), c = path(2);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    const { actor } = rig(5);
    run(actor, 120);
    expect(Math.hypot(actor.pos.x, actor.pos.z)).toBeLessThan(T.wander.radius + 5);
    expect(Math.hypot(actor.pos.x, actor.pos.z)).toBeGreaterThan(1);
  });

  it('walk(false) なら さまよわない', () => {
    const { actor } = rig();
    actor.walk(false);
    run(actor, 60);
    expect(actor.pos.length()).toBe(0);
  });

  it('lookBack: 止まって ふり返り、終わると 休みへ', () => {
    const { actor } = rig();
    actor.walk(false);
    actor.lookBack();
    expect(actor.mode).toBe('look');
    run(actor, 30);
    expect(actor.model.joints.Head.quaternion.w).toBeLessThan(0.99999);
    run(actor, T.clips.fadeSec / T.lookBack.rate + 6.9 / T.lookBack.rate);
    expect(actor.mode).toBe('idle');
  });

  it('目の 色: 白 → 赤は 0.3 秒、20 秒 攻撃されないと 白に もどる。怒って いる 間は 止まって プレイヤーの 方を 向く', () => {
    const { actor, ply } = rig();
    ply.x = 100; ply.z = 0; // +x の 方
    actor.goTo(0, 300);
    run(actor, 3);
    expect(actor.speedNow).toBeGreaterThan(0);
    const eye = actor.model.eyes.color;
    expect(eye.r).toBeCloseTo(1, 3); expect(eye.g).toBeCloseTo(1, 3);
    actor.hit();
    run(actor, 0.15);
    expect(actor.eyeMix).toBeGreaterThan(0.3); expect(actor.eyeMix).toBeLessThan(0.7);
    run(actor, 0.2);
    expect(actor.eyeMix).toBe(1);
    expect(eye.r).toBeCloseTo(1, 2); expect(eye.g).toBeCloseTo(0x3b / 255, 2);
    expect(actor.model.brow.visible).toBe(true);
    const z = actor.pos.z;
    run(actor, 14);
    expect(actor.pos.z).toBeCloseTo(z, 6); // 止まって いる
    expect(actor.mode).toBe('angry');
    // プレイヤー（+x）の 方を 向く（yaw = atan2(dx, dz) = 90 度に ちかい）
    expect(Math.abs(actor.yaw - Math.PI / 2)).toBeLessThan(0.05);
    actor.hit(); // また 攻撃 → 20 秒が はじめから
    run(actor, 19);
    expect(actor.eyeMix).toBe(1);
    run(actor, 1.5);
    expect(actor.mode).toBe('idle');
    run(actor, 0.4);
    expect(actor.eyeMix).toBe(0);
    expect(actor.model.brow.visible).toBe(false);
    expect(eye.g).toBeCloseTo(1, 3);
    actor.angry(true); run(actor, 1); expect(actor.eyeMix).toBe(1);
    actor.angry(false); run(actor, 1); expect(actor.eyeMix).toBe(0);
  });

  /** 体の うしろに 平らな 台（当たりの 箱）を 足して、その 上に 立てる 場所を 返す。体の かたちが かわっても テストが こわれない ように */
  function deckRig(): Rig & { spot: { x: number; z: number; y: number } } {
    const model = buildBig();
    const rest = model.rest.Hips;
    model.hits.push({ name: 'deck', joint: 'Hips', c: new Vector3(0, 40, -60), axes: [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)], half: [30, 1, 20] });
    void rest;
    const ply = { x: 500, y: 1, z: 500, yawDeg: 0 };
    const carried = [0, 0, 0, 0];
    const env: ActorEnv = {
      groundY: () => -1,
      player: () => ply,
      carryPlayer: (dx, dy, dz, dyaw) => { ply.x += dx; ply.y += dy; ply.z += dz; ply.yawDeg += dyaw; carried[0] += dx; carried[1] += dy; carried[2] += dz; carried[3] += dyaw; },
    };
    const actor = new BigActor(model, CLIPS, env, 293);
    actor.place(0, 0, 0, 0);
    const x = 0.5, z = Math.floor(-60 * model.scale + model.rest.Hips.z * 0) + 0.5;
    let j = 120;
    while (j > 0 && !actor.solid(0, j, Math.floor(z))) j--;
    expect(j).toBeGreaterThan(5);
    expect(actor.solid(0, j + 1, Math.floor(z))).toBe(false);
    return { actor, env, ply, carried, spot: { x, z, y: j + 1 } };
  }

  it('乗っている 人: 体が はって 進むと、のっている 人も いっしょに 同じだけ 動く', () => {
    const { actor, ply, carried, spot } = deckRig();
    actor.walk(false);
    const { x, z, y } = spot;
    Object.assign(ply, { x, y, z });
    actor.goTo(0, 300);
    const p0 = actor.pos.clone();
    run(actor, 20);
    const d = actor.pos.clone().sub(p0);
    expect(d.z).toBeGreaterThan(1);
    expect(ply.x - x).toBeCloseTo(d.x, 3);
    expect(ply.z - z).toBeCloseTo(d.z, 3);
    expect(ply.y - y).toBeCloseTo(d.y, 3);
    expect(carried[2]).toBeCloseTo(d.z, 3);
  });

  it('乗っている 人: 体が 向きを かえると、のっている 人も 体の まわりを まわり、向きも いっしょに かわる', () => {
    const { actor, ply, carried, spot } = deckRig();
    actor.walk(false);
    const { x, z, y } = spot;
    Object.assign(ply, { x, y, z, yawDeg: 30 });
    const r0 = Math.hypot(ply.x - actor.pos.x, ply.z - actor.pos.z);
    const a0 = Math.atan2(ply.x - actor.pos.x, ply.z - actor.pos.z);
    const yaw0 = actor.yaw;
    actor.hit(); // 怒って プレイヤーの 方へ 向く（のっている 人の 方向なので、体は まわりつづける）
    run(actor, 1.5);
    const dyaw = actor.yaw - yaw0;
    expect(Math.abs(dyaw)).toBeGreaterThan(0.1);
    // 体の まわりを おなじ だけ まわる（three の rotation.y と おなじ 向き）
    const a1 = Math.atan2(ply.x - actor.pos.x, ply.z - actor.pos.z);
    expect(Math.hypot(ply.x - actor.pos.x, ply.z - actor.pos.z)).toBeCloseTo(r0, 2);
    expect(Math.atan2(Math.sin(a1 - a0 - dyaw), Math.cos(a1 - a0 - dyaw))).toBeCloseTo(0, 3);
    // 向き（度）は 体の 向きと 逆（yawDeg は 時計まわりが ふえる 向き）に おなじだけ
    expect(carried[3]).toBeCloseTo((-dyaw * 180) / Math.PI, 2);
    expect(ply.y).toBeCloseTo(y, 3);
  });

  it('乗っている 人: 向きの おいかけを 切ると（turnWithBody = false）人の 向きは かわらない', () => {
    T.ride.turnWithBody = false;
    try {
      const { actor, ply, carried, spot } = deckRig();
      actor.walk(false);
      const { x, z, y } = spot;
      Object.assign(ply, { x, y, z, yawDeg: 30 });
      actor.hit();
      run(actor, 0.5);
      expect(carried[3]).toBe(0);
      expect(Math.abs(carried[0]) + Math.abs(carried[2])).toBeGreaterThan(0.1); // 位置は 運ばれる
    } finally { T.ride.turnWithBody = true; }
  });

  /** 調整表の 数を 一時的に かえて 実行（かならず もとに もどす） */
  function withWander(o: Partial<{ walkSec: [number, number]; restSec: number; pauseSec: [number, number]; lookBackChance: number; restLookChance: number }>, f: () => void): void {
    // 休みの 時間の しくみを 見る テスト: はう・ふり返りは ふつうの はやさに して 短い 時間で 確かめる
    const keep = { w: { ...T.wander }, c: { ...T.crawl }, l: { ...T.lookBack }, i: T.clips.idleFadeSec };
    Object.assign(T.wander, o);
    Object.assign(T.crawl, { speedPerHeight: 0.05, motionRate: 0.5, turnDegPerSec: 12 });
    T.lookBack.rate = 0.6; T.clips.idleFadeSec = 0.6;
    try { f(); } finally { Object.assign(T.wander, keep.w); Object.assign(T.crawl, keep.c); Object.assign(T.lookBack, keep.l); T.clips.idleFadeSec = keep.i; }
  }

  it('長い 休み: walkSec はい回ったら、restSec の あいだ 体は 動かない。休みが おわると また 歩き出す', () => {
    withWander({ walkSec: [10, 10], restSec: 30, pauseSec: [2, 2], lookBackChance: 0, restLookChance: 0 }, () => {
      const { actor } = rig(5);
      expect(actor.walkLeft).toBe(10);
      // はい回る: 10 秒 の あいだに 動いて いる
      let moved = 0;
      let last = actor.pos.clone();
      for (let i = 0; i < 9.5 * 60; i++) { actor.update(DT); moved += actor.pos.distanceTo(last); last = actor.pos.clone(); }
      expect(moved).toBeGreaterThan(1);
      // 休みに はいる
      run(actor, 1);
      expect(actor.restLeft).toBeGreaterThan(0);
      const p0 = actor.pos.clone(), yaw0 = actor.yaw;
      let still = 0;
      for (let i = 0; i < 28 * 60; i++) { actor.update(DT); if (actor.pos.distanceTo(p0) === 0 && actor.yaw === yaw0) still++; }
      expect(still).toBe(28 * 60); // 休みの あいだ 位置も 向きも かわらない
      expect(actor.mode).toBe('idle');
      expect(actor.speedNow).toBe(0);
      // 休みが おわって また 歩く
      run(actor, 6);
      expect(actor.restLeft).toBe(0);
      expect(actor.mode).toBe('crawl'); // 歩き出した（向きを かえて から 進む）
      expect(actor.target).not.toBe(null);
    });
  });

  it('長い 休みの 長さは 調整表の restSec（既定 300 秒 = 5 分）。walkSec の 既定は 45〜90 秒', () => {
    expect(T.wander.restSec).toBe(300);
    expect(T.wander.walkSec[0]).toBe(45);
    expect(T.wander.walkSec[1]).toBe(90);
    const { actor } = rig();
    expect(actor.walkLeft).toBeGreaterThanOrEqual(45);
    expect(actor.walkLeft).toBeLessThanOrEqual(90);
    actor.rest(); // 引数なし = restSec
    expect(actor.restLeft).toBe(300);
    actor.rest(12);
    expect(actor.restLeft).toBe(12);
  });

  it('休んで いる 間は ときどき 首を ふる（ふり返り）けど 体は 動かさない', () => {
    withWander({ pauseSec: [1, 1], lookBackChance: 0, restLookChance: 1 }, () => {
      const { actor } = rig();
      actor.walk(false);
      actor.rest(60);
      const p0 = actor.pos.clone();
      let looked = 0, headMoved = 0;
      for (let i = 0; i < 30 * 60; i++) {
        actor.update(DT);
        if (actor.mode === 'look') looked++;
        if (actor.model.joints.Head.quaternion.w < 0.9999) headMoved++;
        expect(actor.pos.distanceTo(p0)).toBe(0);
      }
      expect(looked).toBeGreaterThan(60);
      expect(headMoved).toBeGreaterThan(60);
    });
  });

  it('休み 中に 怒ったら 中断して 止まる・プレイヤーを 向く。白目に もどったら また 歩き出す（休みには もどらない）', () => {
    withWander({ walkSec: [1000, 1000], pauseSec: [1, 1], lookBackChance: 0 }, () => {
      const { actor, ply } = rig();
      ply.x = 100; ply.z = 0;
      actor.rest(300);
      run(actor, 2);
      expect(actor.restLeft).toBeGreaterThan(290);
      actor.hit();
      expect(actor.restLeft).toBe(0);
      expect(actor.mode).toBe('angry');
      run(actor, T.angry.calmSec + 0.2);
      expect(actor.mode).toBe('idle');
      expect(actor.restLeft).toBe(0);
      run(actor, 2);
      expect(actor.mode).toBe('crawl'); // 歩き出した
    });
  });

  it('rest() は 怒って いる 間は むし。walk(false) の ときは 歩き回りの 時間は 数えない', () => {
    const { actor } = rig();
    actor.hit();
    actor.rest(50);
    expect(actor.restLeft).toBe(0);
    const b = rig();
    b.actor.walk(false);
    const w0 = b.actor.walkLeft;
    run(b.actor, 5);
    expect(b.actor.walkLeft).toBe(w0);
  });

  it('1 コマの 仕事: 動いている 間も 数が 小さい（箱 70 こ いか、補間 28 こ いか）', () => {
    const { actor } = rig();
    actor.walk(false);
    actor.goTo(0, 300);
    run(actor, 3);
    const w = { ...actor.work };
    console.log('work per frame', JSON.stringify(w), 'boxes', actor.boxCount);
    expect(w.interps).toBeLessThanOrEqual(28);
    expect(w.boxes).toBe(actor.boxCount);
    const t0 = performance.now();
    const N = 600;
    for (let i = 0; i < N; i++) actor.update(DT);
    console.log('ms/frame (node)', ((performance.now() - t0) / N).toFixed(3));
    // 止まって いる 間は 何も しない
    actor.goTo(actor.pos.x, actor.pos.z);
    run(actor, 10);
    run(actor, 0.2);
    expect(actor.work.total).toBe(0);
  });
});
