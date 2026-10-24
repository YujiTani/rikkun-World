import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
import lookBack from './gashaBigClips/lookBack.json';
import { buildBig, cellKey, voxelize, worldHits } from './gashaBig';
import { BigActor, type ActorEnv } from './gashaBigActor';
import { TUNE as T } from './gashaBigTuning';

const CLIPS = { climbUp, climbDown, lookBack };
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

  it('進む 速さの 目安 = 1 歩の 長さ ÷ 1 歩の 秒（1 歩 = ためる → たたきつける → 引きよせる）。さがる クリップは ついている 手が あり、腕が とどく', () => {
    const { actor } = rig();
    const st = actor.step;
    expect(st.stride).toBeGreaterThan(10); // 腕の 届く ぶん（もとの 座標）
    expect(actor.crawlSpeed).toBeCloseTo((st.stride * actor.model.scale) / st.stepSec(), 9);
    expect(actor.crawlRate).toBe(T.crawl.motionRate); // さがる 動きの 速さ
    console.log('stride(blocks)', (st.stride * actor.model.scale).toFixed(2), 'stepSec', st.stepSec().toFixed(2), 'speed', actor.crawlSpeed.toFixed(3));
    const back = actor.plant[1]!;
    expect(back.planted.Left).toBeGreaterThan(10);
    expect(back.planted.Right).toBeGreaterThan(10);
    expect(back.overreachMax).toBeLessThan(1 / actor.model.scale);
  });

  it('goTo: 前へ 進む（1 歩で 1 歩の 長さ ぶん）。着くと 止まる', () => {
    const { actor } = rig();
    actor.walk(false);
    actor.goTo(0, 400); // +z が 前
    const stride = actor.step.stride * actor.model.scale;
    run(actor, actor.step.stepSec() + 0.05);
    expect(actor.mode).toBe('crawl');
    expect(actor.step.steps).toBe(1);
    expect(actor.pos.z).toBeCloseTo(stride, 1); // 1 歩で ちょうど 1 歩の 長さ
    expect(Math.abs(actor.pos.x)).toBeLessThan(0.01);
    const { actor: b } = rig();
    b.walk(false);
    b.goTo(0, stride * 1.2);
    run(b, 2 * b.step.stepSec() + 1);
    expect(b.mode).toBe('idle');
    expect(Math.abs(b.pos.z - stride * 1.2)).toBeLessThan(stride * 0.5 + 0.01); // のこりが 半歩 より 近ければ 止まる
  });

  it('速さは 1/10 を やめて 1/3（yuzu 2026-10-24）: 3 段の 秒は 目安どおり、向きを かえる・ふり返る・さがる は もとの 1/3', () => {
    const C = T.crawl;
    expect(C.windupSec).toBeGreaterThanOrEqual(2.5); expect(C.windupSec).toBeLessThanOrEqual(3);
    expect(C.holdSec).toBeGreaterThanOrEqual(0.3); expect(C.holdSec).toBeLessThanOrEqual(0.5);
    expect(C.slamSec).toBeGreaterThanOrEqual(0.25); expect(C.slamSec).toBeLessThanOrEqual(0.4);
    expect(C.pullSec).toBeGreaterThanOrEqual(1.5); expect(C.pullSec).toBeLessThanOrEqual(2);
    expect(C.turnDegPerSec).toBe(4); // 12 の 1/3
    expect(T.lookBack.rate).toBeCloseTo(0.2, 6); // 0.6 の 1/3
    expect(T.angry.turnDegPerSec).toBeCloseTo(25 / 3, 0); // 25 の 約 1/3
    expect(C.motionRate).toBeCloseTo(0.5 / 3, 2); // さがる 0.5 の 1/3
    expect(T.clips.idleFadeSec).toBeCloseTo(0.6 * 3, 6);
  });

  it('前へ 進む ときは クリップを 使わない（キーの 姿勢）。back(true) で 後ろへ さがり（climbing down wall）、back(false) で 止まる', () => {
    const { actor } = rig();
    actor.walk(false);
    actor.goTo(0, 400);
    const clipName = () => (actor as unknown as { player: { clip: { name: string } | null } }).player.clip?.name ?? '';
    const names = new Set<string>();
    for (let i = 0; i < 20 * 60; i++) { actor.update(DT); names.add(clipName()); }
    expect([...names]).toEqual(['']);
    expect(actor.step.slams).toBeGreaterThanOrEqual(3);
    const z0 = actor.pos.z;
    actor.back(true);
    expect(actor.mode).toBe('back');
    run(actor, 20);
    expect(clipName()).toBe(climbDown.name);
    expect(actor.pos.z).toBeLessThan(z0 - 5); // 後ろへ さがった
    actor.back(false);
    expect(actor.mode).toBe('idle');
    const z1 = actor.pos.z;
    run(actor, 10);
    expect(actor.pos.z).toBe(z1);
  });

  it('1 歩の 段の つなぎ目で 手首が とばない（たたきつけて 止まる コマ いがいは 1 コマの うごきが なめらか）', () => {
    for (const side of ['LeftHand', 'RightHand'] as const) {
      const { actor } = rig();
      actor.walk(false);
      actor.goTo(0, 400);
      const a = new Vector3();
      let prev: Vector3 | null = null, lastStep = NaN, worst = 0, boundaries = 0, lastPhase = actor.step.phase;
      const slamSec = actor.step.phaseSec('slam');
      for (let i = 0; i < Math.ceil(3 * actor.step.stepSec() * 60); i++) {
        actor.update(DT);
        const ph = actor.step.phase;
        actor.model.joints[side].getWorldPosition(a);
        if (prev) {
          const step = a.distanceTo(prev);
          // たたきつけ（だんだん 速く → 地面で ぴたっと 止まる）と つきなおしの 着く コマは のぞく
          const skip = ph === 'slam' || (ph === 'pull' && lastPhase === 'slam') || (ph === 'windup' && lastPhase === 'pull');
          if (!skip && !Number.isNaN(lastStep)) worst = Math.max(worst, Math.abs(step - lastStep));
          lastStep = step;
        }
        if (ph !== lastPhase) boundaries++;
        lastPhase = ph;
        prev = a.clone();
      }
      console.log(side, 'worst speed change per frame', worst.toFixed(4), 'boundaries', boundaries, 'slamSec', slamSec);
      expect(boundaries).toBeGreaterThanOrEqual(10);
      expect(worst).toBeLessThan(0.25); // 1 コマで 0.25 ブロック より 大きく 速さが かわらない
    }
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

  it('目の 色: 白 → 赤は 0.3 秒、calmSec 秒（5 分）攻撃されないと 白に もどる。怒って いる 間は 止まって プレイヤーの 方を 向く', () => {
    const { actor, ply } = rig();
    ply.x = 100; ply.z = 0; // +x の 方
    actor.goTo(0, 300);
    run(actor, T.crawl.windupSec + T.crawl.holdSec + T.crawl.slamSec + 0.3); // ③ 引きよせ の 中
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
    // プレイヤー（+x）の 方を 向く（yaw = atan2(dx, dz)。進んだ ぶん 90 度 から 少し ずれる）
    expect(Math.abs(actor.yaw - Math.atan2(ply.x - actor.pos.x, ply.z - actor.pos.z))).toBeLessThan(0.05);
    expect(Math.abs(actor.yaw - Math.PI / 2)).toBeLessThan(0.15);
    actor.hit(); // また 攻撃 → calmSec が はじめから
    run(actor, T.angry.calmSec - 1);
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

  it('怒って いる 間は 首が プレイヤーの 方へ（左右 ±上限・なめらか）。白目に もどると 正面に もどる', () => {
    const { actor, ply } = rig();
    ply.x = 60; ply.z = 10; ply.y = 0; // 体の 横
    actor.hit();
    let prev = 0, maxStep = 0, maxYaw = 0;
    for (let i = 0; i < 60 * 12; i++) {
      actor.update(DT);
      maxStep = Math.max(maxStep, Math.abs(actor.lookYaw - prev)); prev = actor.lookYaw;
      maxYaw = Math.max(maxYaw, Math.abs(actor.lookYaw));
    }
    const lim = T.angry.lookYawMaxDeg * Math.PI / 180;
    expect(maxYaw).toBeGreaterThan(0.2); // 体が 向く まで の 間、首が 先に 向く
    expect(Math.abs(actor.lookYaw)).toBeLessThanOrEqual(lim + 1e-9);
    expect(Math.abs(actor.lookPitch)).toBeLessThanOrEqual(T.angry.lookPitchMaxDeg * Math.PI / 180 + 1e-9);
    expect(maxStep).toBeLessThanOrEqual(T.angry.lookTurnDegPerSec * Math.PI / 180 * DT + 1e-9); // 急に 振り向かない
    expect(actor.model.joints.Head.quaternion.w).toBeLessThan(0.9999);
    actor.angry(false);
    run(actor, 12);
    expect(actor.lookYaw).toBe(0);
    expect(actor.lookPitch).toBe(0);
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
