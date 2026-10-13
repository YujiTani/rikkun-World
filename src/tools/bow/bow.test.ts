import { describe, expect, it } from 'vitest';
import type { BowEvent, BowStepContext, ItemId, Vec3, YokaiKnock, YokaiRayHit, YokaiWorld } from '../../contracts';
import { createW2Settings } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { createBowSystem } from './BowSystem';

/** x = planeX の 面 を 通る と 当たる 仮の 妖怪（id 1） */
class FakeYokai implements YokaiWorld {
  planeX = Infinity;
  hits: { id: number; amount: number; from: Vec3; knock?: YokaiKnock }[] = [];
  list() {
    return [];
  }
  raycast(o: Vec3, d: Vec3, max: number): YokaiRayHit | null {
    if (d.x <= 0) return null;
    const t = (this.planeX - o.x) / d.x;
    return t >= 0 && t <= max ? { id: 1, kind: 'karakasa', distance: t } : null;
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
  item: ItemId | null = 'yumi';
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
  floor(topY = 9) {
    for (let x = 0; x < 128; x++) for (let z = 0; z < 128; z++) this.world.setBlock(x, topY - 1, z, 'stone');
  }
  setPitch(deg: number) {
    const r = (deg * Math.PI) / 180;
    this.dir = { x: Math.cos(r), y: Math.sin(r), z: 0 };
  }
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      const ctx: BowStepContext = {
        item: this.item,
        pressed: this.held && !this.prevHeld,
        held: this.held,
        eye: this.eye,
        dir: this.dir,
        position: this.pos,
        active: true,
      };
      this.prevHeld = this.held;
      this.bow.update(ctx);
      this.tick++;
    }
  }
  /** n ステップ おして はなす（はなす ステップ まで 進める） */
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

describe('段（AC13）', () => {
  it('9 ステップは 飛ばない・や そのまま・dryRelease', () => {
    const r = new Rig();
    r.pull(9);
    expect(r.ya).toBe(50);
    expect(r.shots).toBe(0);
    expect(r.events('dryRelease')).toHaveLength(1);
    expect(r.bow.arrows()).toHaveLength(0);
  });
  it.each([
    [10, 1, 12],
    [24, 1, 12],
    [25, 2, 20],
    [39, 2, 20],
    [40, 3, 28],
    [300, 3, 28],
  ])('%i ステップ → 段 %i・速さ %i・や が 1 本 へる', (n, stage, speed) => {
    const r = new Rig();
    r.pull(n);
    const shot = r.events('arrowShot')[0] as Extract<BowEvent, { type: 'arrowShot' }>;
    expect(shot.stage).toBe(stage);
    expect(shot.speed).toBe(speed);
    expect(r.ya).toBe(49);
    expect(r.shots).toBe(1);
  });
  it('はなして 9F 以内は ひけず、10F 目から ひける', () => {
    const r2 = new Rig();
    r2.pull(10);
    r2.step(8); // T+9 まで
    r2.held = true;
    r2.step(1); // T+9: まだ
    expect(r2.bow.state().drawing).toBe(false);
    r2.held = false;
    r2.step(1); // T+10
    r2.held = true;
    r2.step(1); // T+11: ひける
    expect(r2.bow.state().drawing).toBe(true);
    const r3 = new Rig();
    r3.pull(10);
    r3.step(9); // T+1〜T+9
    r3.held = true;
    r3.step(1); // T+10
    expect(r3.bow.state().drawing).toBe(true);
  });
  it('や が 0 本 なら 押しても ひかない（noArrow）。ひいたまま 0 本 に なると はなして noArrow', () => {
    const r = new Rig();
    r.ya = 0;
    r.held = true;
    r.step(1);
    expect(r.bow.state().drawing).toBe(false);
    expect(r.events('noArrow')).toHaveLength(1);
    const q = new Rig();
    q.held = true;
    q.step(20);
    q.ya = 0;
    q.held = false;
    q.step(1);
    expect(q.events('noArrow')).toHaveLength(1);
    expect(q.shots).toBe(0);
  });
  it('持ちかえる と ひくのを やめる。や は へらない', () => {
    const r = new Rig();
    r.held = true;
    r.step(30);
    expect(r.bow.state().stage).toBe(2);
    r.item = null;
    r.step(1);
    expect(r.bow.state().drawing).toBe(false);
    r.held = false;
    r.item = 'yumi';
    r.step(1);
    expect(r.ya).toBe(50);
    expect(r.events('arrowShot')).toHaveLength(0);
  });
  it('歩く 速さ 0.5 倍（ひいている あいだ だけ）', () => {
    const r = new Rig();
    expect(r.bow.motion().speedMul).toBe(1);
    r.held = true;
    r.step(3);
    expect(r.bow.motion().speedMul).toBe(0.5);
    r.held = false;
    r.step(1);
    expect(r.bow.motion().speedMul).toBe(1);
  });
  it('段が 上がる ステップに stage の 出来事', () => {
    const r = new Rig();
    r.held = true;
    r.step(40);
    const st = r.events('stage') as Extract<BowEvent, { type: 'stage' }>[];
    expect(st.map((e) => [e.stage, e.tick])).toEqual([
      [1, 9],
      [2, 24],
      [3, 39],
    ]);
  });
});

describe('しなり（pose）', () => {
  it('5・16・31・46 ステップ目', () => {
    const r = new Rig();
    r.held = true;
    const at: Record<number, { stage: number; pull: number; bendDeg: number }> = {};
    for (let i = 1; i <= 46; i++) {
      r.step(1);
      if ([5, 16, 31, 46].includes(i)) at[i] = { ...r.bow.pose() };
    }
    expect(at[5]!.stage).toBe(0);
    expect(at[5]!.pull).toBeGreaterThanOrEqual(0.08);
    expect(at[5]!.pull).toBeLessThanOrEqual(0.2);
    expect(at[16]!.stage).toBe(1);
    expect(at[16]!.pull).toBeCloseTo(0.4, 2);
    expect(at[16]!.bendDeg).toBeCloseTo(12, 0);
    expect(at[31]!.pull).toBeCloseTo(0.7, 2);
    expect(at[31]!.bendDeg).toBeCloseTo(22, 0);
    expect(at[46]!.pull).toBeCloseTo(1, 2);
    expect(Math.abs(at[46]!.bendDeg - 32)).toBeLessThanOrEqual(0.5 + 1e-9);
  });
  it('ひいていない ときは 0', () => {
    const r = new Rig();
    r.step(1);
    expect(r.bow.pose()).toEqual({ stage: 0, pull: 0, bendDeg: 0 });
  });
});

describe('放物線（AC14）', () => {
  it('段 3・水平: n ステップ後 の 位置 が ステップの 式 と 一致', () => {
    const r = new Rig();
    r.eye = { x: 20, y: 30, z: 64 };
    r.pull(40); // 40 ステップ おして、41 ステップ目 で はなす = 発射
    const p0 = { x: 20.3, y: 30 };
    const shotTick = r.tick;
    expect(shotTick).toBe(41);
    let n = 0;
    for (const target of [1, 10, 30]) {
      r.step(target - n);
      n = target;
      const a = r.bow.arrows()[0]!;
      const dt = 1 / 60;
      expect(a.position.x).toBeCloseTo(p0.x + 28 * n * dt, 3);
      expect(a.position.y).toBeCloseTo(p0.y - 20 * dt * dt * ((n * (n + 1)) / 2), 3);
      expect(a.position.z).toBeCloseTo(64, 3);
      expect(a.age).toBe(n);
    }
  });
  it('同じ 条件 で 2 回 うつと ささった 位置 が 同じ。45° の とどく 距離 は 段 1 < 2 < 3 で 段 3 は 37〜43', () => {
    const dist: number[] = [];
    for (const n of [10, 25, 40]) {
      const hits: Vec3[] = [];
      for (let k = 0; k < 2; k++) {
        const r = new Rig();
        r.floor(9);
        r.setPitch(45);
        r.pull(n);
        r.step(400);
        const st = r.bow.stuck();
        expect(st).toHaveLength(1);
        hits.push({ ...st[0]!.position });
      }
      expect(hits[0]).toEqual(hits[1]);
      dist.push(hits[0]!.x - 20);
    }
    expect(dist[0]!).toBeLessThan(dist[1]!);
    expect(dist[1]!).toBeLessThan(dist[2]!);
    expect(dist[2]!).toBeGreaterThanOrEqual(37);
    expect(dist[2]!).toBeLessThanOrEqual(43);
  });
  it('600 ステップで 消える（arrowEnd）。世界の 外 でも', () => {
    const r = new Rig();
    r.eye = { x: 20, y: 40, z: 64 };
    r.dir = { x: 0, y: 1, z: 0 }; // まっすぐ 上: 世界の 上 へ 出ても 落ちて くる まで 待つ
    r.pull(40);
    r.step(60);
    expect(r.events('arrowEnd')).toHaveLength(0);
    expect(r.bow.arrows()).toHaveLength(1);
    const r2 = new Rig();
    r2.settings.arrowLifeTicks = 30;
    r2.eye = { x: 20, y: 40, z: 64 };
    r2.setPitch(10);
    r2.pull(10);
    r2.step(40);
    expect(r2.events('arrowEnd')).toHaveLength(1);
    const r3 = new Rig();
    r3.eye = { x: 120, y: 30, z: 64 };
    r3.pull(40);
    r3.step(60);
    expect(r3.events('arrowEnd')).toHaveLength(1);
    expect(r3.bow.arrows()).toHaveLength(0);
  });
});

describe('当たり（AC15）', () => {
  it.each([
    [10, 1, 0.5],
    [25, 2, 1.0],
    [40, 3, 1.5],
  ])('段 %i: ダメージ %i・ノックバック %d', (n, dmg, knock) => {
    const r = new Rig();
    r.yokai.planeX = 28;
    r.eye = { x: 20, y: 30, z: 64 };
    r.pull(n);
    r.step(120);
    expect(r.yokai.hits).toHaveLength(1);
    const h = r.yokai.hits[0]!;
    expect(h.amount).toBe(dmg);
    expect(h.knock).toEqual({ dist: knock, up: 0 });
    expect(h.from).toEqual(r.pos);
    expect(r.events('arrowHit')).toHaveLength(1);
    expect(r.bow.arrows()).toHaveLength(0);
  });
});

describe('ささった や（AC16）', () => {
  function wallRig() {
    const r = new Rig();
    for (let y = 8; y < 14; y++) for (let z = 60; z < 69; z++) r.world.setBlock(25, y, z, 'stone');
    r.eye = { x: 20, y: 10.62, z: 64 };
    return r;
  }
  it('かべ に ささる → 1,800 ステップ 後 に 消える', () => {
    const r = wallRig();
    r.pull(25);
    r.step(30);
    expect(r.bow.stuck()).toHaveLength(1);
    expect(r.events('arrowStick')).toHaveLength(1);
    const id = r.bow.stuck()[0]!.id;
    r.step(1750);
    expect(r.bow.stuck().map((s) => s.id)).toEqual([id]);
    r.step(60);
    expect(r.bow.stuck()).toHaveLength(0);
    expect(r.ya).toBe(49);
  });
  it('近づく と 1 本 もどる（pickup）', () => {
    const r = wallRig();
    r.pull(25);
    r.step(30);
    const hit = r.bow.stuck()[0]!.position;
    r.pos = { x: hit.x - 1.0, y: 9, z: 64 };
    r.step(1);
    expect(r.ya).toBe(50);
    expect(r.events('pickup')).toHaveLength(1);
    expect(r.bow.stuck()).toHaveLength(0);
  });
  it('遠い と 拾わない', () => {
    const r = wallRig();
    r.pull(25);
    r.step(30);
    r.step(5);
    expect(r.bow.stuck()).toHaveLength(1);
    expect(r.ya).toBe(49);
  });
  it('33 本 うつと 32 本（古い ほうが 消える）', () => {
    const r = wallRig();
    const ids: number[] = [];
    for (let i = 0; i < 33; i++) {
      r.pull(25);
      r.step(30);
      ids.push(r.bow.stuck()[r.bow.stuck().length - 1]!.id);
    }
    expect(r.bow.stuck()).toHaveLength(32);
    expect(r.bow.stuck()[0]!.id).toBe(ids[1]);
  });
});
