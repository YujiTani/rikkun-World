import { describe, expect, it } from 'vitest';
import type { BowEvent, BowStepContext, ItemId, Vec3, YokaiKnock, YokaiRayHit, YokaiWorld } from '../../contracts';
import { createW2Settings } from '../../contracts';
import { LEGEND4_TUNING } from '../../content/items/legend4Tuning';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { createBowSystem } from './BowSystem';

/**
 * LEGEND-4 PR1 黒龍（docs/design/LEGEND-4.md §4.6 K1〜K6・K12）: 重力 0・まっすぐ・全部 つらぬく・石で 止まる・48 マスで 消える。
 * 数（ダメージ・きょり）は 表（LEGEND4_TUNING・設定）から 読む。決め打ち しない。
 */

interface Box {
  id: number;
  kind: 'karakasa';
  /** 箱の 中心（x, y, z）と 半分の 大きさ */
  c: Vec3;
  h: Vec3;
}

/** 箱（AABB）で 線を 見る 仮の 妖怪の 世界。raycast（最初の 1 体）と raycastAll（線に かかる 全部）を 両方 持つ */
class FakeYokai implements YokaiWorld {
  boxes: Box[] = [];
  hits: { id: number; amount: number; from: Vec3; knock?: YokaiKnock }[] = [];
  allCalls = 0;
  ignore = new Set<number>(); // 当たらない 体（どうぶつ・仲間は 妖怪の 世界に 入らない ので 空でよい）
  list() {
    return [];
  }
  private entry(b: Box, o: Vec3, d: Vec3): number {
    let t0 = 0;
    let t1 = Infinity;
    for (const k of ['x', 'y', 'z'] as const) {
      const lo = b.c[k] - b.h[k];
      const hi = b.c[k] + b.h[k];
      if (Math.abs(d[k]) < 1e-12) {
        if (o[k] < lo || o[k] > hi) return -1;
      } else {
        let a = (lo - o[k]) / d[k];
        let c = (hi - o[k]) / d[k];
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        if (t0 > t1) return -1;
      }
    }
    return t0;
  }
  raycast(o: Vec3, d: Vec3, max: number): YokaiRayHit | null {
    const all = this.raycastAll(o, d, max);
    this.allCalls--;
    return all[0] ?? null;
  }
  raycastAll(o: Vec3, d: Vec3, max: number): readonly YokaiRayHit[] {
    this.allCalls++;
    const out: YokaiRayHit[] = [];
    for (const b of this.boxes) {
      const t = this.entry(b, o, d);
      if (t >= 0 && t <= max) out.push({ id: b.id, kind: b.kind, distance: t });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }
  damage(id: number, amount: number, from: Vec3, knock?: YokaiKnock) {
    this.hits.push({ id, amount, from, knock });
  }
  occupies() {
    return false;
  }
  drainEvents() {
    return [];
  }
}

class Rig {
  world = new ArrayVoxelWorld();
  yokai = new FakeYokai();
  settings = createW2Settings();
  ya = 50;
  shots = 0;
  tick = 0;
  pos: Vec3 = { x: 20, y: 9, z: 64 };
  eye: Vec3 = { x: 20, y: 10.62, z: 64 };
  dir: Vec3 = { x: 1, y: 0, z: 0 };
  item: ItemId | null = 'kokuryu';
  held = false;
  prevHeld = false;
  inv = {
    count: (i: ItemId) => (i === 'ya' ? this.ya : 0),
    remove: (i: ItemId, n: number) => {
      if (i !== 'ya') return 0;
      const k = Math.min(n, this.ya);
      this.ya -= k;
      return k;
    },
    add: (i: ItemId, n: number) => {
      if (i === 'ya') this.ya += n;
      return 0;
    },
    canAdd: () => true,
  };
  bow = createBowSystem({
    world: this.world,
    yokai: () => this.yokai,
    settings: this.settings,
    inventory: this.inv,
    onShot: () => this.shots++,
    tick: () => this.tick,
  });
  /** x 方向へ 向かう 体（体力 99 の 仮）。dx = 目の 位置から の きょり。y は 目の 高さ */
  putYokai(id: number, dx: number, dz = 0) {
    this.yokai.boxes.push({ id, kind: 'karakasa', c: { x: this.eye.x + dx, y: this.eye.y, z: this.eye.z + dz }, h: { x: 0.45, y: 0.9, z: 0.45 } });
  }
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      const ctx: BowStepContext = { item: this.item, pressed: this.held && !this.prevHeld, held: this.held, eye: this.eye, dir: this.dir, position: this.pos, active: true };
      this.prevHeld = this.held;
      this.bow.update(ctx);
      this.tick++;
    }
  }
  /** n ステップ おして はなす */
  pull(n: number) {
    this.held = true;
    this.step(n);
    this.held = false;
    this.step(1);
  }
  events(type: BowEvent['type']) {
    return this.bow.peekEvents().filter((e) => e.type === type);
  }
}

const K = LEGEND4_TUNING.kokuryu;
const DT = 1 / 60;
// 段 1・2・3 を 出す ひく 長さ（bowStageTicks 10・25・40）
const PULL: Record<1 | 2 | 3, number> = { 1: 10, 2: 25, 3: 40 };

describe('K1 まっすぐ（重力 0）', () => {
  it.each([1, 2, 3] as const)('段 %i: velocity.y は とんで いる 間 ずっと 同じ・位置は 毎ステップ 速さ/60 の 一直線', (st) => {
    const r = new Rig();
    r.dir = { x: Math.cos(0.3), y: Math.sin(0.3), z: 0 }; // ななめ 上
    r.pull(PULL[st]);
    const a = r.bow.arrows()[0]!;
    const vy0 = a.velocity.y;
    const speed = r.settings.bowSpeed[st - 1]!;
    expect(a.straight).toBe(true);
    expect(vy0).toBeCloseTo(speed * Math.sin(0.3), 5);
    let p = { ...a.position };
    for (let i = 0; i < 30; i++) {
      r.step(1);
      const b = r.bow.arrows()[0]!;
      expect(b.velocity.y).toBeCloseTo(vy0, 9);
      expect(Math.hypot(b.position.x - p.x, b.position.y - p.y, b.position.z - p.z)).toBeCloseTo(speed * DT, 3);
      expect(b.position.y - p.y).toBeCloseTo(vy0 * DT, 3);
      p = { ...b.position };
    }
  });
  it('出る 点は 目 ＋ 0.3 × 向き。ふつうの ゆみは 今まで どおり 落ちる', () => {
    const r = new Rig();
    r.pull(PULL[3]);
    expect(r.bow.arrows()[0]!.position.x).toBeCloseTo(r.eye.x + 0.3 + 0, 0);
    const n = new Rig();
    n.item = 'yumi';
    n.pull(PULL[3]);
    const a = n.bow.arrows()[0]!;
    expect(a.straight).toBeFalsy();
    n.step(30);
    expect(n.bow.arrows()[0]!.velocity.y).toBeLessThan(-1); // 重力で 下向きの 速さが ついた
  });
  it('ダメージは 表（設定 bowDamageByItem）の 段ごとの 数。LEGEND4_TUNING と 同じ', () => {
    for (const st of [1, 2, 3] as const) {
      const r = new Rig();
      r.putYokai(1, 6);
      r.pull(PULL[st]);
      r.step(60);
      expect(r.yokai.hits[0]!.amount).toBe(K.damage[st - 1]);
    }
  });
});

describe('K2 つらぬく（各 1 回）・石に ささる', () => {
  it('2 マスずつ 3 体 → 3 体 とも 同じ だけ へる。うしろの 石に ささって 1 本 ふえる', () => {
    const r = new Rig();
    r.world.setBlock(40, 10, 64, 'stone');
    for (const [i, dx] of [4, 6, 8].entries()) r.putYokai(i + 1, dx);
    r.pull(PULL[3]);
    r.step(120);
    expect(r.yokai.hits.map((h) => h.id)).toEqual([1, 2, 3]); // 近い 順・各 1 回
    for (const h of r.yokai.hits) expect(h.amount).toBe(K.damage[2]);
    expect(r.bow.arrows()).toHaveLength(0);
    expect(r.bow.stuck()).toHaveLength(1);
    expect(r.events('arrowHit')).toHaveLength(3);
    expect(r.events('arrowStick')).toHaveLength(1);
  });
  it('ぬりかべ も つらぬく: 当たっても 矢は おそく ならない', () => {
    const r = new Rig();
    r.putYokai(1, 4);
    r.pull(PULL[3]);
    const speed = r.settings.bowSpeed[2]!;
    const before = r.bow.arrows()[0]!.position.x;
    r.step(10);
    expect(r.bow.arrows()[0]!.position.x - before).toBeCloseTo(speed * DT * 10, 2);
  });
});

describe('K3 石で 止まる', () => {
  it('2 体目と 3 体目の 間に 石 → 1・2 体目だけ ダメージ。3 体目は そのまま。矢は 石に ささる', () => {
    const r = new Rig();
    // 目 x=20。石は x=27（体 1・2 は 24・26 の まわり、3 は 28 の まわり）
    r.world.setBlock(27, 10, 64, 'stone');
    for (const [i, dx] of [4, 6, 8].entries()) r.putYokai(i + 1, dx);
    r.pull(PULL[3]);
    r.step(120);
    expect(r.yokai.hits.map((h) => h.id)).toEqual([1, 2]);
    expect(r.bow.stuck()).toHaveLength(1);
    expect(r.bow.arrows()).toHaveLength(0);
  });
});

describe('K4 同じ 妖怪に 1 回だけ', () => {
  it('おおきな 箱が 何ステップも 線に かかっても ダメージは 1 回', () => {
    const r = new Rig();
    r.yokai.boxes.push({ id: 1, kind: 'karakasa', c: { x: r.eye.x + 8, y: r.eye.y, z: r.eye.z }, h: { x: 3, y: 0.9, z: 0.45 } }); // 6 マスの 長さ
    r.pull(PULL[1]); // 12 マス/秒 = 1 ステップ 0.2 マス → 30 ステップ かかる
    r.step(400);
    expect(r.yokai.hits).toHaveLength(1);
    expect(r.events('arrowHit')).toHaveLength(1);
    expect(r.bow.arrows()).toHaveLength(0);
  });
  it('窓口 combat.arrows() の hitIds に もう 当てた 妖怪が 入る', () => {
    const r = new Rig();
    r.putYokai(7, 3);
    r.pull(PULL[3]);
    r.step(12);
    const a = r.bow.arrows()[0]!;
    expect(a.hitIds).toEqual([7]);
  });
});

describe('K5 きょりで 消える', () => {
  it.each([1, 2, 3] as const)('段 %i: 何にも 当たらなければ うった 所から range マス（±0.5）で arrowEnd。ささった 矢は ふえない', (st) => {
    const r = new Rig();
    r.pull(PULL[st]);
    const start = { ...r.bow.arrows()[0]!.position };
    r.step(300);
    expect(r.bow.arrows()).toHaveLength(0);
    expect(r.bow.stuck()).toHaveLength(0);
    const end = r.events('arrowEnd')[0] as Extract<BowEvent, { type: 'arrowEnd' }>;
    expect(end).toBeDefined();
    expect(Math.abs(end.position.x - start.x - K.range)).toBeLessThanOrEqual(0.5);
  });
  it('真上へ うつと まっすぐ のぼって range で 消える', () => {
    const r = new Rig();
    r.dir = { x: 0, y: 1, z: 0 };
    r.pull(PULL[3]);
    r.step(300);
    const end = r.events('arrowEnd')[0] as Extract<BowEvent, { type: 'arrowEnd' }>;
    expect(end.position.y - r.eye.y).toBeGreaterThan(K.range - 1);
  });
  it('真下へ うつと 足もとの ブロックに ささる', () => {
    const r = new Rig();
    for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) r.world.setBlock(20 + dx, 8, 64 + dz, 'stone');
    r.dir = { x: 0, y: -1, z: 0 };
    r.pos = { x: 30, y: 9, z: 70 }; // ささった 矢を すぐ ひろわない 所へ
    r.pull(PULL[3]);
    r.step(30);
    expect(r.bow.stuck()).toHaveLength(1);
  });
});

describe('K6 妖怪の 世界に ない 体（仲間・どうぶつ）は すりぬける', () => {
  it('妖怪の 一覧に 入らない 体は 見ない。ダメージ 0・矢は 止まらない（石まで とんで ささる）', () => {
    const r = new Rig();
    r.world.setBlock(30, 10, 64, 'stone');
    r.pull(PULL[3]);
    r.step(60);
    expect(r.yokai.hits).toHaveLength(0);
    expect(r.bow.stuck()).toHaveLength(1);
  });
});

describe('K12 性能: 1 ステップに 1 本が 妖怪を 見る 回数', () => {
  it('raycastAll は 1 ステップに 1 本 1 回だけ（妖怪が 2 倍でも 回数は かわらない）', () => {
    const count = (n: number) => {
      const r = new Rig();
      for (let i = 0; i < n; i++) r.putYokai(i + 1, 3 + i * 2);
      r.pull(PULL[3]);
      r.yokai.allCalls = 0;
      r.step(1);
      return r.yokai.allCalls;
    };
    expect(count(5)).toBe(1);
    expect(count(10)).toBe(1);
  });
  it('飛んで いない ときは 見ない', () => {
    const r = new Rig();
    r.putYokai(1, 3);
    r.step(5);
    expect(r.yokai.allCalls).toBe(0);
  });
});
