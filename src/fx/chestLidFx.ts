import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Matrix4, Mesh, MeshBasicMaterial, Object3D, Vector3, type Scene } from 'three';
import type { Rarity } from '../contracts';
import { createChestPillar } from './bagVisuals';
import { CHEST_RIGHT, type ChestCompass, type ChestTier } from '../world/blocks/chestBlock';
import { CHEST_FRONT_VEC, chestLidGrid } from '../world/render/looks/chestLooks';

/**
 * 宝箱の ふたが あく 動き（MINE-1C。アート 07-mine.md 20.7）。0.46 秒（28 ステップ）。
 * 動く 間だけ ふた（18×9×9 の 小ブロック）を べつの メッシュ 1 つ（描画 +1）に して ちょうつがい（y 4 の 下の 面・おく 3）の まわりに まわす。
 * 角度: 0 → 10°（0.06 秒）→ 4°（0.12）→ 90°（0.30）→ 78°（0.38）→ 90°（0.46）。90° より うしろへ 行かない。
 * ブロックの あいた 形は すぐ 入れ替わる（見た目の ふたは `setChestLidless` で 動く 間だけ 消す）。この クラスは 見た目だけ。
 */
const LID_STEPS = 28;

/** [秒, 角度（度）] */
const KEYS: readonly (readonly [number, number])[] = [[0, 0], [0.06, 10], [0.12, 4], [0.3, 90], [0.38, 78], [0.46, 90]];

function lidAngleDeg(t: number): number {
  if (t <= 0) return 0;
  for (let i = 1; i < KEYS.length; i++) {
    const [t1, a1] = KEYS[i]!;
    if (t <= t1) {
      const [t0, a0] = KEYS[i - 1]!;
      const u = (t - t0) / (t1 - t0);
      const e = u * u * (3 - 2 * u); // なめらか
      return a0 + (a1 - a0) * e;
    }
  }
  return 90;
}

/** 光の 柱が 出る ステップ（0.25 秒） */
const PILLAR_FROM = 15;
const N = 9;
const at = (x: number, y: number, z: number): number => (x * N + y) * N + z;

function lidGeometry(tier: ChestTier): BufferGeometry {
  const { lid, color } = chestLidGrid(tier);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const has = (x: number, y: number, z: number): boolean => x >= 0 && x < 18 && y >= 0 && y < N && z >= 0 && z < N && lid[at(x, y, z)] !== '';
  const FACES: readonly (readonly [number, number, number, readonly (readonly [number, number, number])[]])[] = [
    [1, 0, 0, [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
    [-1, 0, 0, [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
    [0, 1, 0, [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
    [0, -1, 0, [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
    [0, 0, 1, [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
    [0, 0, -1, [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
  ];
  const c = new Color();
  for (let x = 0; x < 18; x++) {
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        if (!has(x, y, z)) continue;
        c.set(color(lid[at(x, y, z)]!));
        for (const [dx, dy, dz, vs] of FACES) {
          if (has(x + dx, y + dy, z + dz)) continue;
          const shade = dy > 0 ? 1 : dy < 0 ? 0.6 : dz !== 0 ? 0.85 : 0.75;
          const base = pos.length / 3;
          for (const [vx, vy, vz] of vs) {
            pos.push(x + vx, y + vy - 4, z + vz - 3); // ちょうつがいが 原点
            col.push(c.r * shade, c.g * shade, c.b * shade);
          }
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

interface Running {
  root: Object3D;
  pivot: Object3D;
  mesh: Mesh;
  age: number;
  done: () => void;
  pillar: Mesh | null;
}

export class ChestLidFx {
  private readonly running: Running[] = [];
  private readonly pillars = new Map<Rarity, Mesh>();
  private readonly geos = new Map<ChestTier, BufferGeometry>();
  private readonly mat = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });

  constructor(private readonly scene: Scene) {}

  /** 本体の マス main（世界の ブロック座標）・段・前の 向きで 動きを はじめる。終わったら done */
  start(main: { x: number; y: number; z: number }, tier: ChestTier, front: ChestCompass, rarity: Rarity, done: () => void): void {
    let g = this.geos.get(tier);
    if (!g) this.geos.set(tier, (g = lidGeometry(tier)));
    const R = CHEST_RIGHT[front];
    const F = CHEST_FRONT_VEC[front];
    const sx = R[0] !== 0 ? R[0] : F[0];
    const sz = R[1] !== 0 ? R[1] : F[1];
    const root = new Object3D();
    root.matrixAutoUpdate = false;
    root.matrix.copy(new Matrix4().makeBasis(new Vector3(R[0] / N, 0, R[1] / N), new Vector3(0, 1 / N, 0), new Vector3(F[0] / N, 0, F[1] / N)).setPosition(main.x + (sx > 0 ? 0 : 1), main.y, main.z + (sz > 0 ? 0 : 1)));
    root.matrixWorldNeedsUpdate = true;
    const pivot = new Object3D();
    pivot.position.set(0, 4, 3);
    const mesh = new Mesh(g, this.mat);
    mesh.frustumCulled = false;
    pivot.add(mesh);
    root.add(pivot);
    this.scene.add(root);
    // 光の 柱（中身で いちばん めずらしい 色）。ふたが 半分 あく 0.25 秒から、中身が 出る まで
    let pillar = this.pillars.get(rarity) ?? null;
    if (!pillar) this.pillars.set(rarity, (pillar = createChestPillar(rarity)));
    pillar.position.set(main.x + 0.5 + (R[0] !== 0 ? R[0] * 0.5 : 0), main.y + 3.6, main.z + 0.5 + (R[1] !== 0 ? R[1] * 0.5 : 0));
    this.running.push({ root, pivot, mesh, age: 0, done, pillar });
  }

  active(): number {
    return this.running.length;
  }

  /** 毎ステップ */
  step(): void {
    for (let i = this.running.length - 1; i >= 0; i--) {
      const r = this.running[i]!;
      r.age++;
      const deg = lidAngleDeg(r.age / 60);
      r.pivot.rotation.x = (-deg * Math.PI) / 180;
      if (r.pillar && r.age === PILLAR_FROM) this.scene.add(r.pillar);
      if (r.age >= LID_STEPS) {
        this.scene.remove(r.root);
        if (r.pillar) this.scene.remove(r.pillar);
        this.running.splice(i, 1);
        r.done();
      }
    }
  }
}
