import { describe, expect, it } from 'vitest';
import { BigShock } from './gashaBigShock';
import { TUNE as T } from './gashaBigTuning';

const DT = 1 / 60;

/** 平らな 世界（立つ 面 = 0）。プレイヤーの 入力は「ロック」の まねで 止める（main.ts の blockPlayerInput と おなじ 重ね方） */
function rig(at = { x: 0, y: 0, z: 0 }) {
  const ply = { ...at };
  const hurts: number[] = [];
  const pushes: { x: number; y: number; z: number }[] = [];
  let invincible = 0;
  const shock = new BigShock({
    player: () => ply, groundY: () => -1,
    hurt: (amount) => { if (invincible > 0) return false; hurts.push(amount); return true; },
    setPlayerVelocity: (v) => pushes.push(v),
  });
  const lock = { playInputEnabled: () => true };
  const orig = lock.playInputEnabled.bind(lock);
  lock.playInputEnabled = () => orig() && !shock.inputBlocked();
  return { shock, ply, hurts, pushes, lock, setInvincible: (n: number) => { invincible = n; } };
}
const run = (s: BigShock, sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) s.step(DT); };

describe('gashaBigShock（#293 手が 地面を たたいた ときの 当たりと ひるみ）', () => {
  it('ひるみの 間は 入力が きかない（調整表の 秒）。おわると もどる', () => {
    const { shock, lock } = rig({ x: 1, y: 0, z: 0 });
    expect(lock.playInputEnabled()).toBe(true);
    shock.add('tap', 0, 0, 0);
    expect(shock.inputBlocked()).toBe(true);
    expect(lock.playInputEnabled()).toBe(false);
    expect(T.stagger.sec).toBeGreaterThanOrEqual(0.4); expect(T.stagger.sec).toBeLessThanOrEqual(0.6);
    run(shock, T.stagger.sec - 0.05);
    expect(lock.playInputEnabled()).toBe(false);
    run(shock, 0.1);
    expect(lock.playInputEnabled()).toBe(true);
  });

  it('当たると 手から 外へ はじかれる（少し 上へ うく）。画面が ゆれる', () => {
    const { shock, pushes } = rig({ x: 0, y: 0, z: 2 }); // 手の +z がわ
    shock.add('slam', 0, 0, 0);
    expect(pushes.length).toBe(1);
    const p = pushes[0]!;
    expect(p.z).toBeCloseTo(T.stagger.knockSpeed, 6); // 手から 外（+z）へ
    expect(Math.abs(p.x)).toBeLessThan(1e-9);
    expect(p.y).toBe(T.stagger.knockUp);
    expect(shock.shakeNow).toBeGreaterThan(0);
    run(shock, Math.max(T.slam.shakeSec, T.stagger.shakeSec) + 0.05);
    expect(shock.shakeNow).toBe(0);
    // 小さい 衝撃は よわく はじく
    const b = rig({ x: -1, y: 0, z: 0 });
    b.shock.add('tap', 0, 0, 0);
    expect(b.pushes[0]!.x).toBeCloseTo(-T.stagger.tapKnockSpeed, 6);
  });

  it('小さい 衝撃（つきなおし）も 当たる: 半径の 中で 地面に いれば ダメージ。外・ジャンプ中は 当たらない', () => {
    const inside = rig({ x: T.slam.tapRadius - 0.5, y: 0, z: 0 });
    inside.shock.add('tap', 0, 0, 0);
    expect(inside.hurts).toEqual([T.slam.tapDamage]);
    expect(inside.shock.hits[0]!.kind).toBe('tap');
    const outside = rig({ x: T.slam.tapRadius + 0.5, y: 0, z: 0 });
    outside.shock.add('tap', 0, 0, 0);
    expect(outside.hurts).toEqual([]);
    expect(outside.shock.inputBlocked()).toBe(false);
    const jumping = rig({ x: 1, y: 1.2, z: 0 });
    jumping.shock.add('tap', 0, 0, 0);
    expect(jumping.hurts).toEqual([]);
  });

  it('打撃は 手の まわりだけ・その コマ。衝撃波は 広がる 輪の ふちが 通った とき 1 回だけ。打撃を 受けた 人には 衝撃波は 当てない', () => {
    const near = rig({ x: 1, y: 0, z: 0 });
    near.shock.add('slam', 0, 0, 0);
    expect(near.hurts).toEqual([T.slam.hitDamage]);
    run(near.shock, 2);
    expect(near.hurts).toEqual([T.slam.hitDamage]);
    const mid = rig({ x: 12, y: 0, z: 0 });
    mid.shock.add('slam', 0, 0, 0);
    expect(mid.hurts).toEqual([]);
    run(mid.shock, 12 / T.slam.waveSpeed + 0.1);
    expect(mid.hurts).toEqual([T.slam.waveDamage]);
    run(mid.shock, 2);
    expect(mid.hurts).toEqual([T.slam.waveDamage]);
    const out = rig({ x: T.slam.waveRadius + 2, y: 0, z: 0 });
    out.shock.add('slam', 0, 0, 0);
    run(out.shock, 3);
    expect(out.hurts).toEqual([]);
    expect(out.shock.impacts.length).toBe(0); // 見た目が おわったら のぞく
  });

  it('むてき中（ダメージが 入らない）は ひるまない', () => {
    const r = rig({ x: 1, y: 0, z: 0 });
    r.setInvincible(1);
    r.shock.add('tap', 0, 0, 0);
    expect(r.shock.inputBlocked()).toBe(false);
    expect(r.pushes.length).toBe(0);
    expect(r.shock.hits[0]!.ok).toBe(false);
  });
});

describe('両手たたきつけ slam2（予告の 半円 → 打撃 → 特大の 衝撃波）', () => {
  const K = T.slam2;
  const F = { fx: 0, fz: 1 }; // 体の 前 = +z

  it('半円の 中（前がわ）は 打撃の 大ダメージ。手の うしろ（体の がわ）は 半円の 外', () => {
    const a = rig({ x: 1, y: 0, z: 5 });
    a.shock.add('slam2', 0, 0, 0, F);
    expect(a.hurts[0]).toBe(K.hitDamage);
    expect(a.shock.hits[0]!.kind).toBe('hit');
    const b = rig({ x: 1, y: 0, z: -5 }); // 半径の 中でも 手の うしろがわ
    b.shock.add('slam2', 0, 0, 0, F);
    expect(b.hurts).toEqual([]);
  });

  it('半円の 外（半径より 遠い）は 打撃なし。高く ジャンプ してれば 打撃を よけられる', () => {
    const far = rig({ x: 0, y: 0, z: K.warnRadius + 2 });
    far.shock.add('slam2', 0, 0, 0, F);
    expect(far.hurts).toEqual([]);
    const air = rig({ x: 0, y: K.hitHeight + 1, z: 3 });
    air.shock.add('slam2', 0, 0, 0, F);
    expect(air.hurts).toEqual([]);
  });

  it('順番: 打撃（その コマ）→ 衝撃波（あとから 広がって 当たる）。半円の 外の 人は 衝撃波だけ', () => {
    const r = rig({ x: 0, y: 0, z: K.warnRadius + 6 });
    const imp = r.shock.add('slam2', 0, 0, 0, F);
    expect(r.hurts).toEqual([]);
    expect(imp.maxR).toBe(K.waveRadius);
    run(r.shock, (K.warnRadius + 6) / K.waveSpeed + 0.3);
    expect(r.hurts).toEqual([K.waveDamage]);
    expect(r.shock.hits[0]!.kind).toBe('wave');
  });

  it('打撃を 受けた 人には 衝撃波は 当たらない（1 回だけ）', () => {
    const r = rig({ x: 0, y: 0, z: 3 });
    r.shock.add('slam2', 0, 0, 0, F);
    run(r.shock, 3);
    expect(r.hurts).toEqual([K.hitDamage]);
  });

  it('衝撃波は ジャンプで よけられる（足が waveHeight より 上）。前進の 輪（24）より 大きく 太く 速い', () => {
    expect(K.waveRadius).toBeGreaterThan(T.slam.waveRadius);
    expect(K.waveBand).toBeGreaterThan(T.slam.waveBand);
    expect(K.waveSpeed).toBeGreaterThan(T.slam.waveSpeed);
    const r = rig({ x: 0, y: K.waveHeight + 0.5, z: K.warnRadius + 8 });
    r.shock.add('slam2', 0, 0, 0, F);
    run(r.shock, 3);
    expect(r.hurts).toEqual([]);
  });

  it('アースクエイク: 前進の たたきつけより ゆれが 強く 長く、遠くまで とどく', () => {
    const a = rig({ x: 0, y: 0, z: 30 }), b = rig({ x: 0, y: 0, z: 30 });
    a.shock.add('slam2', 0, 0, 0, F);
    b.shock.add('slam', 0, 0, 0);
    expect(a.shock.shakeNow).toBeGreaterThan(b.shock.shakeNow);
    run(a.shock, 1.2); run(b.shock, 1.2);
    expect(a.shock.shakeNow).toBeGreaterThan(0.05); // 前進の ゆれ（0.7 秒）は もう 消えた あとも ゆれて いる
    expect(b.shock.shakeNow).toBe(0);
    const far = rig({ x: 0, y: 0, z: 90 }); // 前進の ゆれの 届く 70 より 遠い
    far.shock.add('slam2', 0, 0, 0, F);
    expect(far.shock.shakeNow).toBeGreaterThan(0);
    run(a.shock, K.shakeSec);
    expect(a.shock.shakeNow).toBe(0);
  });
});

describe('両手で 払う: 腕に 当たった とき（sweepStrike）', () => {
  const K = T.sweep;
  it('ダメージ・大きく はじく（払う 向き）・上へ うかす・入力が きかない 秒（前進の 打撃より 長い）', () => {
    const r = rig({ x: 0, y: 0, z: 0 });
    expect(r.shock.sweepStrike({ x: 3, y: 0, z: 0 }, 1, 0)).toBe(true);
    expect(r.hurts).toEqual([K.damage]);
    expect(r.shock.hits[0]!.kind).toBe('sweep');
    expect(r.pushes[0]).toEqual({ x: K.knockSpeed, y: K.knockUp, z: 0 });
    expect(r.shock.inputBlocked()).toBe(true);
    expect(K.knockSpeed).toBeGreaterThan(T.stagger.knockSpeed);
    expect(K.staggerSec).toBeGreaterThan(T.stagger.sec);
    run(r.shock, K.staggerSec - 0.05);
    expect(r.shock.inputBlocked()).toBe(true);
    run(r.shock, 0.1);
    expect(r.shock.inputBlocked()).toBe(false);
    expect(r.shock.shakeNow).toBeGreaterThanOrEqual(0);
  });
  it('むてき中（hurt が false）は はじかない', () => {
    const r = rig({ x: 0, y: 0, z: 0 });
    r.setInvincible(5);
    expect(r.shock.sweepStrike({ x: 3, y: 0, z: 0 }, 1, 0)).toBe(false);
    expect(r.pushes).toEqual([]);
    expect(r.shock.inputBlocked()).toBe(false);
  });
});
