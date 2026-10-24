import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
import lookBack from './gashaBigClips/lookBack.json';
import { buildBig } from './gashaBig';
import { BigActor, type ActorEnv } from './gashaBigActor';
import { TUNE as T } from './gashaBigTuning';

const CLIPS = { climbUp, climbDown, lookBack };
const DT = 1 / 60;
const PLAYER_WALK = 4.0; // src/player/config.ts の walkSpeed（ブロック / 秒）

/** 平らな 世界。groundH を かえれば 地面の 高さを かえられる */
function rig(player: { x: number; z: number }, groundH = { v: -1 }, yaw = 0) {
  const ply = { x: player.x, y: 1, z: player.z, yawDeg: 0 };
  const env: ActorEnv = { groundY: () => groundH.v, player: () => ply };
  const actor = new BigActor(buildBig(), CLIPS, env, 5);
  actor.place(0, 0, 0, yaw);
  actor.walk(false);
  return { actor, ply, groundH };
}
const run = (a: BigActor, sec: number): void => { for (let i = 0; i < Math.round(sec / DT); i++) a.update(DT); };
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

describe('追いかける・浮いて 進む（FIX-BRIEF-2 §2）', () => {
  let atk = true;
  beforeEach(() => { atk = T.attack.enabled; T.attack.enabled = false; });
  afterEach(() => { T.attack.enabled = atk; });

  it('調整表 chase に 速さ・止まる 距離・向きの 速さ・高さ固定が ある。進む 速さは プレイヤーの 歩きより 遅い', () => {
    const C = T.chase;
    expect(C.enabled).toBe(true);
    expect(C.holdHeight).toBe(true);
    expect(C.stopDist).toBeGreaterThan(0);
    expect(C.turnDegPerSec).toBeGreaterThan(0);
    const { actor } = rig({ x: 0, z: 400 });
    expect(actor.crawlSpeed * C.speedMul).toBeLessThan(PLAYER_WALK);
  });

  it('うしろに いる プレイヤーにも 振り返る（首が 先 → 体）。体が プレイヤーの 方を 向く', () => {
    const { actor } = rig({ x: 0, z: -200 }); // 体は +z を 向いて いる。プレイヤーは 真うしろ
    actor.hit();
    run(actor, 0.5);
    expect(Math.abs(actor.lookYaw)).toBeGreaterThan(0.1); // 首が 先に まわる
    expect(actor.bodyTurning).toBe(false); // 体は まだ
    run(actor, 4);
    expect(actor.bodyTurning).toBe(true); // 首が turnStartDeg に 着いたら 体が まわる
    const y0 = actor.yaw;
    run(actor, 10);
    expect(Math.abs(wrap(actor.yaw - y0))).toBeGreaterThan(0.5);
    run(actor, 60);
    expect(Math.abs(wrap(actor.yaw - Math.atan2(0 - actor.pos.x, -200 - actor.pos.z)))).toBeLessThan(0.35);
  });

  it('怒って いる 間、遠い プレイヤーへ 近づく。進む 速さは プレイヤーの 歩きより 遅い', () => {
    const { actor } = rig({ x: 0, z: 300 });
    actor.hit();
    const d0 = 300 - actor.pos.z;
    run(actor, 60);
    const moved = actor.pos.z - 0;
    expect(moved).toBeGreaterThan(5);
    expect(300 - actor.pos.z).toBeLessThan(d0);
    expect(moved / 60).toBeLessThan(PLAYER_WALK);
    expect(actor.mode).toBe('angry');
  });

  it('近すぎる とき(stopDist いない)は 動かない', () => {
    const { actor } = rig({ x: 0, z: T.chase.stopDist - 4 });
    actor.hit();
    run(actor, 30);
    expect(actor.pos.length()).toBeLessThan(0.01);
    expect(actor.chasing).toBe(false);
  });

  it('止まる 距離に ついたら 止まり、そこで 立ち止まる（行きすぎない）', () => {
    const { actor } = rig({ x: 0, z: 90 });
    actor.hit();
    run(actor, 200);
    const d = Math.hypot(actor.pos.x, actor.pos.z - 90);
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(T.chase.stopDist + T.chase.resumeMargin + 25);
    const p = actor.pos.clone();
    run(actor, 10);
    expect(actor.pos.distanceTo(p)).toBeLessThan(1);
  });

  it('chase.enabled = false なら 今までどおり その場で 向きだけ かえる', () => {
    T.chase.enabled = false;
    try {
      const { actor } = rig({ x: 0, z: 300 });
      actor.hit();
      run(actor, 30);
      expect(actor.pos.length()).toBeLessThan(0.01);
    } finally { T.chase.enabled = true; }
  });

  it('高さを 保つ: 歩いて 地面が 高く なっても 体の 高さは かわらない。holdHeight = false なら 地面に ついて いく', () => {
    const g = { v: -1 };
    const { actor } = rig({ x: 0, z: 300 }, g);
    actor.hit();
    run(actor, 2);
    g.v = 9; // 地面が 急に 10 ブロック 高く なった
    run(actor, 40);
    expect(actor.pos.z).toBeGreaterThan(5);
    expect(actor.pos.y).toBe(0);
    T.chase.holdHeight = false;
    try {
      run(actor, 20);
      expect(actor.pos.y).toBeGreaterThan(1);
    } finally { T.chase.holdHeight = true; }
  });

  it('ふだんの さまよいでも 高さを 保つ', () => {
    const g = { v: -1 };
    const { actor } = rig({ x: 500, z: 500 }, g);
    actor.walk(true);
    g.v = 9;
    actor.goTo(0, 200);
    run(actor, 30);
    expect(actor.pos.z).toBeGreaterThan(5);
    expect(actor.pos.y).toBe(0);
  });
});
