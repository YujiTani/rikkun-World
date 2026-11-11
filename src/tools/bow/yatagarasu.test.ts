import { describe, expect, it } from 'vitest';
import type { BowEvent, BowStepContext, ItemId, Vec3, YokaiInfo, YokaiKnock, YokaiRayHit, YokaiWorld } from '../../contracts';
import { createW2Settings } from '../../contracts';
import { LEGEND4_TUNING } from '../../content/items/legend4Tuning';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { createBowSystem } from './BowSystem';

/**
 * LEGEND-4 PR2 八咫烏（docs/design/LEGEND-4.md §5.6 Y1〜Y5・Y8）: 当たった 点で ほのお（半径 2・3 ダメージ）・矢は ささらない・ブロックは そのまま・
 * 2 回に 1 回 矢が へらない（くじを 外から 決める）。数は 表（LEGEND4_TUNING.yatagarasu）から 読む。
 */
const Y = LEGEND4_TUNING.yatagarasu;
const BODY_H = 0.8; // 体の まん中の 高さ（足もとから）
interface Body { id: number; c: Vec3; h: Vec3 }

/** 箱で 線を 見る 仮の 妖怪の 世界（list は 足もと ＋ 体の 大きさ） */
class FakeYokai implements YokaiWorld {
  boxes: Body[] = [];
  hits: { id: number; amount: number; from: Vec3; knock?: YokaiKnock }[] = [];
  listCalls = 0;
  list(): YokaiInfo[] {
    this.listCalls++;
    return this.boxes.map((b) => ({ id: b.id, kind: 'karakasa', position: { x: b.c.x, y: b.c.y - BODY_H, z: b.c.z }, scale: 1, hp: 99 }) as unknown as YokaiInfo);
  }
  private entry(b: Body, o: Vec3, d: Vec3): number {
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
    let best: YokaiRayHit | null = null;
    for (const b of this.boxes) {
      const t = this.entry(b, o, d);
      if (t >= 0 && t <= max && (!best || t < best.distance)) best = { id: b.id, kind: 'karakasa', distance: t };
    }
    return best;
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
  ya = 100;
  shots = 0;
  tick = 0;
  pos: Vec3 = { x: 20, y: 9, z: 64 };
  eye: Vec3 = { x: 20, y: 10.62, z: 64 };
  dir: Vec3 = { x: 1, y: 0, z: 0 };
  item: ItemId | null = 'yatagarasu';
  held = false;
  prevHeld = false;
  rolls: number[] = [];
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
    saveRoll: () => this.rolls.shift() ?? 0.99,
  });
  /** x 方向 dx・z 方向 dz に ある 体（体の まん中の 高さ ＝ 目の 高さ） */
  put(id: number, dx: number, dz = 0, dy = 0) {
    this.yokai.boxes.push({ id, c: { x: this.eye.x + dx, y: this.eye.y + dy, z: this.eye.z + dz }, h: { x: 0.45, y: 0.9, z: 0.45 } });
  }
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      const ctx: BowStepContext = { item: this.item, pressed: this.held && !this.prevHeld, held: this.held, eye: this.eye, dir: this.dir, position: this.pos, active: true };
      this.prevHeld = this.held;
      this.bow.update(ctx);
      this.tick++;
    }
  }
  pull(n: number) {
    this.held = true;
    this.step(n);
    this.held = false;
    this.step(1);
  }
  events<T extends BowEvent['type']>(type: T) {
    return this.bow.peekEvents().filter((e): e is Extract<BowEvent, { type: T }> => e.type === type);
  }
  dmg(id: number): number {
    return this.yokai.hits.filter((h) => h.id === id).reduce((a, h) => a + h.amount, 0);
  }
}

const STAGE3 = 40;
const STAGE1 = 10;

describe('Y1 当たった 体は 矢 ＋ ほのお・となりも へる・とおい 体は へらない', () => {
  it('段 3: A は 矢 10 ＋ 3、B（横 1.5）は 3、C（横 3）は 0', () => {
    const r = new Rig();
    r.put(1, 8);
    r.put(2, 8, 1.5);
    r.put(3, 8, 3);
    r.pull(STAGE3);
    r.step(60);
    expect(r.dmg(1)).toBe(Y.damage[2] + Y.burstDamage);
    expect(r.dmg(1)).toBe(13);
    expect(r.dmg(2)).toBe(Y.burstDamage);
    expect(r.dmg(3)).toBe(0);
    expect(r.events('yataBurst')).toHaveLength(1);
    expect(r.events('arrowHit')).toHaveLength(1);
  });
  it.each([
    [1, 4],
    [2, 6],
  ] as const)('段 %i: 矢の ダメージは 表の %i ＋ ほのお 3', (st, arrow) => {
    const r = new Rig();
    r.put(1, 3); // 近い 体（段 1・2 は 矢が 落ちる ので）
    r.pull(st === 1 ? STAGE1 : 25);
    r.step(60);
    expect(Y.damage[st - 1]).toBe(arrow);
    expect(r.dmg(1)).toBe(arrow + Y.burstDamage);
  });
  it('ほのおの ノックバックは [外向き 水平, 上]（ほのおの 点が 押す 元）', () => {
    const r = new Rig();
    r.put(1, 8);
    r.put(2, 8, 1.5);
    r.pull(STAGE3);
    r.step(60);
    const fire = r.yokai.hits.filter((h) => h.id === 2)[0]!;
    expect(fire.knock).toEqual({ dist: Y.burstKnock[0], up: Y.burstKnock[1] });
    const ev = r.events('yataBurst')[0]!;
    expect(fire.from.x).toBeCloseTo(ev.position.x, 5);
    expect(fire.from.z).toBeCloseTo(ev.position.z, 5);
  });
  it('自分（足もとに 撃つ）・プレイヤーは 妖怪の 世界に いない ので 当たらない。yataBurst の hits は 当てた 体の 一覧', () => {
    const r = new Rig();
    r.put(1, 8);
    r.put(2, 8, 1.5);
    r.pull(STAGE3);
    r.step(60);
    const ev = r.events('yataBurst')[0]!;
    expect(ev.hits.map((h) => h.id).sort()).toEqual([1, 2]);
    expect(ev.hits.find((h) => h.id === 1)!.damage).toBe(Y.burstDamage);
  });
});

describe('Y2 石の かべ: ほのお 1 回・矢は ふえない・ブロックは かわらない', () => {
  it('石に 当てる → yataBurst 1 回（位置は 当たった 点 ±0.05）・ささった 矢 0・ブロック 不変', () => {
    const r = new Rig();
    for (let y = 8; y < 13; y++) for (let z = 62; z < 67; z++) r.world.setBlock(30, y, z, 'stone');
    const before: string[] = [];
    for (let x = 28; x < 33; x++) for (let y = 7; y < 14; y++) for (let z = 61; z < 68; z++) before.push(`${x},${y},${z}:${r.world.getBlock(x, y, z)}`);
    r.pull(STAGE3);
    r.step(80);
    const bursts = r.events('yataBurst');
    expect(bursts).toHaveLength(1);
    expect(bursts[0]!.position.x).toBeGreaterThan(30 - 0.05 - 1e-6);
    expect(bursts[0]!.position.x).toBeLessThan(30 + 0.05);
    expect(bursts[0]!.position.y).toBeLessThan(r.eye.y); // 放物線で 少し 落ちて いる
    expect(r.bow.stuck()).toHaveLength(0);
    expect(r.bow.arrows()).toHaveLength(0);
    const after: string[] = [];
    for (let x = 28; x < 33; x++) for (let y = 7; y < 14; y++) for (let z = 61; z < 68; z++) after.push(`${x},${y},${z}:${r.world.getBlock(x, y, z)}`);
    expect(after).toEqual(before);
  });
  it('かべの すぐ 手前の 体には 当たる（かべの 面から 少し もどした 点で 見る）', () => {
    const r = new Rig();
    for (let y = 8; y < 13; y++) for (let z = 62; z < 67; z++) r.world.setBlock(30, y, z, 'stone');
    r.put(1, 9.5, 1.2); // かべの 手前（矢の 線から はずれて いる 体）
    r.pull(STAGE3);
    r.step(80);
    expect(r.dmg(1)).toBe(Y.burstDamage);
  });
});

describe('Y3 さえぎり・きょり', () => {
  it('ほのおの 点と 体の あいだに 固い ブロックが あると 当たらない', () => {
    const r = new Rig();
    r.put(1, 8); // 直接 当たる 体
    r.put(2, 8, 1.5);
    r.world.setBlock(27, 10, 65, 'stone'); // 当たった 点（27.55, 64）から B の 中心（28, 65.5）への 線が とおる 所
    r.pull(STAGE3);
    r.step(60);
    expect(r.dmg(1)).toBeGreaterThanOrEqual(Y.damage[2]);
    expect(r.dmg(2)).toBe(0);
  });
  it('中心が 1.7 以内の 体は 必ず・箱が 2.3 より 外の 体は 当たらない', () => {
    for (const off of [0.2, 1.0, 1.6]) {
      const r = new Rig();
      r.put(1, 8);
      r.put(2, 8, off);
      r.pull(STAGE3);
      r.step(60);
      expect(r.dmg(2), `横 ${off}`).toBe(Y.burstDamage);
    }
    for (const off of [3.2, 4, 6]) {
      const r = new Rig();
      r.put(1, 8);
      r.put(2, 8, off);
      r.pull(STAGE3);
      r.step(60);
      expect(r.dmg(2), `横 ${off}`).toBe(0);
    }
  });
});

describe('Y4 へらない くじ', () => {
  it('同じ シードで 50 回: くじが 0.5 未満の 回は へらず、0.5 以上の 回は 1 へる', () => {
    const r = new Rig();
    const rolls: number[] = [];
    // 乱数列（外から 決める）
    for (let i = 0; i < 50; i++) rolls.push(((i * 37) % 100) / 100);
    r.rolls = [...rolls];
    let expectLeft = r.ya;
    for (let i = 0; i < 50; i++) {
      r.pull(STAGE1);
      r.step(r.settings.bowNockTicks + 1);
      if (rolls[i]! >= Y.saveChance) expectLeft--;
      expect(r.ya, `${i} 回目 くじ ${rolls[i]}`).toBe(expectLeft);
      r.bow.arrows().length = 0;
    }
    expect(r.shots).toBe(50); // たいきゅうは へらなくても 毎回
  });
  it('へらなかった とき arrowSaved が 1 回 出る・へった ときは 出ない', () => {
    const r = new Rig();
    r.rolls = [0.1, 0.9];
    r.pull(STAGE1);
    expect(r.events('arrowSaved')).toHaveLength(1);
    r.step(r.settings.bowNockTicks + 1);
    r.pull(STAGE1);
    expect(r.events('arrowSaved')).toHaveLength(1);
  });
  it('矢が 0 本なら ひき始めない（noArrow）', () => {
    const r = new Rig();
    r.ya = 0;
    r.held = true;
    r.step(5);
    expect(r.events('noArrow').length).toBeGreaterThan(0);
    expect(r.bow.state().drawing).toBe(false);
  });
  it('ふつうの ゆみは くじを 使わない（乱数を 引かない）', () => {
    const r = new Rig();
    r.item = 'yumi';
    r.rolls = [0.1];
    r.pull(STAGE1);
    expect(r.ya).toBe(99);
    expect(r.rolls).toEqual([0.1]);
  });
});

describe('Y5 世界の 外では ほのおが 出ない', () => {
  it('せかいの 外へ 消えた 矢: yataBurst なし・arrowEnd', () => {
    const r = new Rig();
    r.pos = { x: 1, y: 9, z: 64 };
    r.eye = { x: 1, y: 10.62, z: 64 };
    r.dir = { x: -1, y: 0, z: 0 };
    r.pull(STAGE3);
    r.step(60);
    expect(r.events('yataBurst')).toHaveLength(0);
    expect(r.events('arrowEnd').length).toBeGreaterThan(0);
  });
});

describe('Y8 性能: ほのお 1 つで 見る 妖怪の 数', () => {
  it('list は 1 回だけ 呼ぶ（近くの 妖怪を 1 周 するだけ）', () => {
    const r = new Rig();
    r.put(1, 8);
    for (let i = 0; i < 6; i++) r.put(10 + i, 8, 1 + i * 0.3);
    r.pull(STAGE3);
    const before = r.yokai.listCalls;
    r.step(60);
    expect(r.yokai.listCalls - before).toBe(1);
  });
});

describe('矢の 見た目の 口', () => {
  it('八咫烏の 矢は burst: true・ふつうの 矢は 書かない・重力は ふつうの 弓と 同じ', () => {
    const r = new Rig();
    r.pull(STAGE3);
    const a = r.bow.arrows()[0]!;
    expect(a.burst).toBe(true);
    expect(a.straight).toBeFalsy();
    r.step(20);
    expect(r.bow.arrows()[0]!.velocity.y).toBeLessThan(-1);
    const n = new Rig();
    n.item = 'yumi';
    n.pull(STAGE3);
    expect(n.bow.arrows()[0]!.burst).toBeFalsy();
  });
});
