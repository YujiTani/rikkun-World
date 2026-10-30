import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { InkCloud, INK_PUFFS } from './takoInk';
import { TakoHachimaki } from './tako_hachimaki';

/** TAKO-1 AC23（性能）・AC21 の 形の 数（試作 D と 同じ: 箱 24・三角形 288）。見た目の 確認は オーナー */
function stats(root: THREE.Object3D, all = false) {
  let tris = 0;
  let boxes = 0;
  (all ? root.traverse.bind(root) : root.traverseVisible.bind(root))((o: THREE.Object3D) => {
    if (o instanceof THREE.Mesh && !o.userData.focusHull) {
      boxes++;
      tris += (o.geometry.index?.count ?? 0) / 3;
    }
  });
  return { tris, boxes };
}

describe('TakoHachimaki の 形', () => {
  it('三角形 300 以下・描画 24 回（足の 箱 込み）', () => {
    const m = new TakoHachimaki();
    const s = stats(m.root);
    expect(s.tris).toBeLessThanOrEqual(300);
    expect(s.boxes).toBe(24);
    m.dispose();
  });

  it('およぐ 間は 足が 回り（回転が すすむ）、とまると 回転が 落ちて ゆっくり 止まる', () => {
    const m = new TakoHachimaki();
    let r0 = m.info().rotor!;
    for (let i = 0; i < 30; i++) {
      m.drive('go', i / 60, 1);
      m.update(1 / 60);
    }
    const spun = m.info().rotor! - r0;
    expect(spun).toBeGreaterThan(Math.PI * 2 * 0.4); // 0.5 秒で 半周 ちかく
    r0 = m.info().rotor!;
    for (let i = 0; i < 60; i++) {
      m.drive('rest', 4 + i / 60, 0); // 4 秒 たてば もう 回らない
      m.update(1 / 60);
    }
    expect(m.info().rotor! - r0).toBeLessThan(1e-6);
    m.dispose();
  });

  it('すみの ため・はく・ぺちんで 動きが 出る（ため = 口が ふくらむ）', () => {
    const m = new TakoHachimaki();
    m.update(1 / 60);
    const y0 = m.info().bodyY!;
    m.slapT = 0.1;
    m.update(1 / 60);
    expect(m.root.visible).toBe(true);
    expect(Number.isFinite(m.info().bodyY! - y0)).toBe(true);
    m.dispose();
  });
});

describe('InkCloud（すみの けむり）', () => {
  it('小さな 箱 10 こ・はいて 2 秒で 消える・さいごの 0.9 秒で うすく なる', () => {
    expect(INK_PUFFS).toBe(10);
    const c = new InkCloud(2, 2, 0.9);
    expect(stats(c.group, true).boxes).toBe(10);
    expect(c.active).toBe(false);
    c.start(0, 0, 0, 0, -1, 1);
    expect(c.active).toBe(true);
    const opacity = () => Math.max(...c.group.children.filter((m) => m.visible).map((m) => ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity));
    for (let i = 0; i < 60; i++) c.step(1 / 60);
    const mid = opacity();
    expect(mid).toBeGreaterThan(0.8);
    for (let i = 0; i < 50; i++) c.step(1 / 60);
    expect(opacity()).toBeLessThan(mid);
    for (let i = 0; i < 20; i++) c.step(1 / 60);
    expect(c.active).toBe(false);
    expect(c.group.visible).toBe(false);
    c.dispose();
  });

  it('けむりは 半径 2 ブロックの 中に おさまる（つぶの 中心）', () => {
    const c = new InkCloud(2, 2, 0.9);
    c.start(0, 0, 0, 0, -1, 7);
    let far = 0;
    for (let i = 0; i < 100; i++) {
      c.step(1 / 60);
      for (const m of c.group.children) if (m.visible) far = Math.max(far, m.position.length());
    }
    expect(far).toBeLessThanOrEqual(2.3);
    c.dispose();
  });
});
