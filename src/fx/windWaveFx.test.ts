import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { WindWaveFx } from './windWaveFx';
import { installFakeDocument, makeCamera, maxAlpha, newMeshes, readVerts } from './legendFxTestKit';

/**
 * 風神剣の 真空波 v2（2026-10-23 オーナー決定）: 帯と 同じ 作りの「飛んでいく 風」。
 * 見た目だけ（当たり・速さ・数は WaveSystem の テスト）。ルール #255: 弾 1 つで 描画 1・三角形 400 以下・何も ない 時は 0。
 * 期待が 変わった（理由: 旧 AC34「カメラ正面の 板 1 まい」は、白い みかづきの 板を やめて 風の すじに した ため）。
 */
beforeAll(() => {
  installFakeDocument();
});

const wave = (id: number, traveled: number, over: Record<string, unknown> = {}) =>
  ({ id, kind: 'wave', dir: { x: 0, y: 0, z: -1 }, position: { x: 3, y: 1, z: 4 - traveled }, drawPos: { x: 3.4, y: 1, z: 4 - traveled }, traveled, age: Math.round(traveled / 0.25), spin: 0, face: 0, bodyAlpha: null, backAlpha: null, ...over }) as never;

const make = () => {
  const scene = new THREE.Scene();
  const before = new Set<THREE.Object3D>(scene.children);
  const fx = new WindWaveFx({ scene, camera: makeCamera() });
  return { scene, fx, mesh: () => newMeshes(scene, before).find((m) => m.renderOrder === 9)! };
};
/** 1 つの 波を 出てから 消えるまで（約 5 マス = 20 ステップ）飛ばす */
const fly = (fx: InstanceType<typeof WindWaveFx>, mesh: () => THREE.Mesh, reduced = false) => {
  const rec: { draws: number; tris: number; alpha: number; pos: number[] }[] = [];
  for (let a = 0; a <= 22; a++) {
    fx.step([wave(1, a * 0.25)], reduced);
    const v = readVerts(mesh());
    rec.push({ draws: fx.info().draws, tris: fx.info().tris, alpha: maxAlpha(v), pos: Array.from(v.pos) });
  }
  return rec;
};

describe('数（#255）: 描画 1・三角形 400 以下・何も ない 時は 0', () => {
  it('何も 飛んで いない: 描画 0・三角形 0', () => {
    const { fx } = make();
    for (let i = 0; i < 5; i++) {
      fx.step([]);
      expect(fx.info()).toMatchObject({ draws: 0, tris: 0, waves: 0 });
    }
  });
  it('弾 1 つ: 描画 1・三角形 400 以下（0 では ない）', () => {
    const { fx, mesh } = make();
    const rec = fly(fx, mesh);
    expect(Math.max(...rec.map((r) => r.draws))).toBe(1);
    expect(Math.max(...rec.map((r) => r.tris))).toBeGreaterThan(50);
    expect(Math.max(...rec.map((r) => r.tris))).toBeLessThanOrEqual(400);
  });
  it('波が 8 つ 同時でも 描画は 1', () => {
    const { fx } = make();
    fx.step(Array.from({ length: 8 }, (_, i) => wave(i + 1, 1 + i * 0.4)));
    expect(fx.info().draws).toBe(1);
    expect(fx.info().waves).toBe(8);
  });
  it('らせん（kind spiral）は ここでは 描かない', () => {
    const { fx } = make();
    fx.step([wave(1, 1, { kind: 'spiral', face: null })]);
    expect(fx.info()).toMatchObject({ draws: 0, tris: 0, waves: 0 });
  });
  it('飛びおわると 描画 0 に もどる', () => {
    const { fx, mesh } = make();
    fly(fx, mesh);
    fx.step([]);
    expect(fx.info().draws).toBe(0);
  });
  it('うごきを へらす: すじが へって 三角形も へる', () => {
    const a = make();
    const b = make();
    const full = Math.max(...fly(a.fx, a.mesh).map((r) => r.tris));
    const less = Math.max(...fly(b.fx, b.mesh, true).map((r) => r.tris));
    expect(less).toBeGreaterThan(0);
    expect(less).toBeLessThan(full);
  });
});

describe('見た目: 進む 向きに のびる・先が 明るい・うしろが 消える・点滅しない', () => {
  it('すじは 進む 向き（-z）に のびる: 頂点の 広がりが x より z で 大きい', () => {
    const { fx, mesh } = make();
    fx.step([wave(1, 2)]);
    const p = readVerts(mesh()).pos;
    let z0 = Infinity, z1 = -Infinity, x0 = Infinity, x1 = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      z0 = Math.min(z0, p[i + 2]!); z1 = Math.max(z1, p[i + 2]!);
      x0 = Math.min(x0, p[i]!); x1 = Math.max(x1, p[i]!);
    }
    expect(z1 - z0).toBeGreaterThan(1.5);
    expect(z1 - z0).toBeGreaterThan(x1 - x0);
    // 先（いちばん 前）は 今の 位置 drawPos の 近く
    expect(z0).toBeLessThan(4 - 2 + 0.2);
    expect(z0).toBeGreaterThan(4 - 2 - 0.5);
  });
  it('先の ほうが うしろより 明るい（頂点の 明るさ）', () => {
    const { fx, mesh } = make();
    fx.step([wave(1, 2)]);
    const v = readVerts(mesh());
    let front = 0, back = 0;
    for (let i = 0; i < v.n; i++) {
      const z = v.pos[i * 3 + 2]!;
      const a = v.col[i * 4 + 3]!;
      if (z < 2.5) front = Math.max(front, a);
      if (z > 3.5) back = Math.max(back, a);
    }
    expect(front).toBeGreaterThan(back);
  });
  it('さいごは うすく なって 消える（とつぜんは 消えない）', () => {
    const { fx, mesh } = make();
    const rec = fly(fx, mesh);
    const mid = rec[8]!.alpha;
    expect(mid).toBeGreaterThan(0.9);
    expect(rec[18]!.alpha).toBeLessThan(mid);
    expect(rec[18]!.alpha).toBeGreaterThan(0);
  });
  it('同じ 入力に 同じ 形（シード付き）・毎ステップ 変わらない 明るさの ゆれは ない', () => {
    const a = make();
    const b = make();
    const ra = fly(a.fx, a.mesh);
    const rb = fly(b.fx, b.mesh);
    expect(ra.map((r) => r.pos)).toEqual(rb.map((r) => r.pos));
    // 明るさ（最大）は 年れいで 少しずつ しか 変わらない（前の 値と 行ったり来たり しない）
    const al = ra.slice(6, 20).map((r) => r.alpha);
    for (let i = 2; i < al.length; i++) expect(Math.abs(al[i]! - al[i - 1]!) <= 0.25 || Math.sign(al[i]! - al[i - 1]!) === Math.sign(al[i - 1]! - al[i - 2]!)).toBe(true);
  });
  it('位置は 見た目の drawPos（当たりの position では ない）', () => {
    const { fx, mesh } = make();
    fx.step([wave(1, 2, { position: { x: 50, y: 50, z: 50 } })]);
    const p = readVerts(mesh()).pos;
    let near = 0;
    for (let i = 0; i < p.length; i += 3) if (Math.hypot(p[i]! - 3.4, p[i + 1]! - 1, p[i + 2]! - 2) < 1.5) near++;
    expect(near).toBeGreaterThan(0);
    for (let i = 0; i < p.length; i += 3) expect(p[i]!).toBeLessThan(10);
  });
});

describe('ブロックで 消えたら 小さな 風の けむり', () => {
  it('waveEnd（block）で けむりが 出て 6 ステップで 消える', () => {
    const { scene, fx } = make();
    fx.onEvent({ type: 'waveEnd', reason: 'block', position: { x: 1, y: 1, z: 1 } } as never);
    const puffs = () => scene.children.flatMap((c) => (c as THREE.Group).children ?? []).filter((m) => m.visible);
    fx.step([]);
    expect(puffs().length).toBe(1);
    for (let i = 0; i < 8; i++) fx.step([]);
    expect(puffs().length).toBe(0);
  });
});
