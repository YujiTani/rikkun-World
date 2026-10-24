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
