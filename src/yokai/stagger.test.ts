import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, PlayerCombat, TimeOfDay, Vec3, YokaiKind } from '../contracts';
import { createW2Settings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { KIND_AI } from './ai/config';
import { YokaiManager } from './ai/YokaiManager';
import { createStaggerBook } from './stagger';

/**
 * WEAPON-5 のユニットテスト（docs/design/WEAPON-5.md §6 の AC4・AC10・AC11）。
 * 仕様書は 窓口（`yokai.stagger/attackNow/fireballList` §4.8）までしか 決めていないので、部品の 形は ここで 決めた。
 * 名前だけ 実装に あわせて 直すときは、import と下の `m.…` の 呼び出しだけ 直す（期待の 数は 変えない）。
 *
 *   src/yokai/stagger.ts
 *     createStaggerBook(settings) → { stagger(id, by), get(id), step(), damage(id, amount), remove(id) }
 *       get(id) = { ticksLeft, double } | null、damage = 2 倍に した あとの 数（0.01 の位に まるめる。1 回だけ）
 *   YokaiManager（src/yokai/ai/YokaiManager.ts）に 足すもの
 *     attackNow(id) → { hitInSteps } | null、stagger(id)、applyStagger(id, by)（取り消し ＋ よろけ）、
 *     fireballList() → [{ position, dir, speed, reflected, owner }]、reflectFireball(index) → boolean（はね返す）
 *     取り消しは `settings`（createW2Settings）の 数を 使う: コンストラクタの deps に `settings` を 足す
 */

const S = createW2Settings() as ReturnType<typeof createW2Settings> & Record<string, any>;

describe('AC4: 2 倍', () => {
  it('よろけ中の 1 回目が 2 倍（6 つの例）。2 回目は ふつう', () => {
    for (const [a, w] of [[3, 6], [2.3, 4.6], [6.9, 13.8], [15, 30], [1, 2], [3, 6]] as const) {
      const b = createStaggerBook(S);
      b.stagger(1, 'parry');
      expect(b.get(1)).toEqual({ ticksLeft: 90, double: true });
      expect(b.damage(1, a), `${a}`).toBeCloseTo(w, 3);
      expect(b.get(1)!.double).toBe(false);
      expect(b.damage(1, a), `${a} の 2 回目`).toBeCloseTo(a, 6);
    }
  });
  it('よろけていない 妖怪は ふつう', () => {
    const b = createStaggerBook(S);
    expect(b.damage(5, 3)).toBe(3);
    expect(b.get(5)).toBeNull();
  });
  it('よろけが おわった あとは ふつう（90 ステップ）', () => {
    const b = createStaggerBook(S);
    b.stagger(1, 'parry');
    for (let i = 0; i < 89; i++) b.step();
    expect(b.get(1)).toEqual({ ticksLeft: 1, double: true });
    b.step();
    expect(b.get(1)).toBeNull();
    expect(b.damage(1, 3)).toBe(3);
  });
  it('もう一度 よろけたら のこりは 90 に もどる。2 倍は 1 回分だけ（重ねない）', () => {
    const b = createStaggerBook(S);
    b.stagger(1, 'parry');
    for (let i = 0; i < 30; i++) b.step();
    b.stagger(1, 'reflect');
    expect(b.get(1)).toEqual({ ticksLeft: 90, double: true });
    expect(b.damage(1, 3)).toBe(6);
    expect(b.damage(1, 3)).toBe(3); // 重ねても 2 回目は ふつう
    // 使ったあとに もう一度 よろけたら また 1 回分
    b.stagger(1, 'parry');
    expect(b.get(1)).toEqual({ ticksLeft: 90, double: true });
    expect(b.damage(1, 2)).toBe(4);
  });
  it('設定: staggerTicks・staggerDamageMul を 変えると 動く', () => {
    const s = createW2Settings() as any;
    s.staggerTicks = 10;
    s.staggerDamageMul = 3;
    const b = createStaggerBook(s);
    b.stagger(1, 'parry');
    expect(b.get(1)!.ticksLeft).toBe(10);
    expect(b.damage(1, 2)).toBe(6);
  });
  it('倒れた・帰った・消えた → よろけも 消える', () => {
    const b = createStaggerBook(S);
    b.stagger(1, 'parry');
    b.remove(1);
    expect(b.get(1)).toBeNull();
  });
});

// ───────────────────────────── YokaiManager（AC10・AC11）

function rig(playerPos: Vec3 = { x: 10.5, y: 9, z: 20.5 }) {
  const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
  for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) world.setBlock(x, 8, z, 'stone');
  const t = {
    dayTick: () => 0, day: () => 0, phase: (): DayPhase => 'day', skyColor: () => '#000000', brightness: () => 1,
    dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {},
  } as unknown as TimeOfDay;
  const hits: Array<{ amount: number; by: YokaiKind; from: Vec3 }> = [];
  const combat: PlayerCombat = {
    hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0,
    damage: (amount, by, from) => (hits.push({ amount, by, from }), true),
    heal: () => 0, drainEvents: () => [],
  };
  const inventory = { add: () => 0 } as unknown as Inventory;
  const player = { position: { ...playerPos } };
  const m = new YokaiManager({ world, time: t, getPlayer: () => player, combat, inventory, seed: 1, settings: S } as any) as any;
  m.config.yokaiAutoSpawn = false;
  m.config.yokaiWander = false;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) m.update(1 / 60);
  };
  const info = (id: number) => m.list().find((y: any) => y.id === id);
  return { m, step, hits, player, info };
}

describe('AC10: よろけ（妖怪）', () => {
  it('90 ステップの 間 動かず・攻撃せず・体当たりの ダメージ 0。91 ステップ目に null、そのあと 次の攻撃まで 攻撃しない', () => {
    const { m, step, hits, info, player } = rig();
    // プレイヤーの すぐ そば（体当たりが 起きる きょり）に 置く
    const id = m.spawn('karakasa', player.position.x, 9, player.position.z - 0.5, { ai: true });
    m.takeHookEvents();
    m.applyStagger(id, 'parry');
    const p0 = { ...info(id).position };
    const cool = 120; // からかさの 「次の攻撃まで」
    for (let k = 1; k <= 90; k++) {
      step();
      if (k < 90) expect(m.stagger(id), `${k}`).not.toBeNull();
      const q = info(id).position;
      expect(Math.hypot(q.x - p0.x, q.z - p0.z), `${k} ステップ目の 位置`).toBeLessThanOrEqual(0.001);
    }
    expect(hits, '体当たり・攻撃の ダメージ 0').toHaveLength(0);
    expect(m.takeHookEvents().filter((e: any) => e.type === 'attackStart'), 'attackStart').toHaveLength(0);
    step();
    expect(m.stagger(id), '91 ステップ目').toBeNull();
    // 次の攻撃まで（からかさ 120）は 攻撃しない
    for (let k = 0; k < cool - 5; k++) step();
    expect(m.takeHookEvents().filter((e: any) => e.type === 'attackStart')).toHaveLength(0);
    // そのあと 攻撃する
    for (let k = 0; k < 200; k++) step();
    expect(m.takeHookEvents().filter((e: any) => e.type === 'attackStart').length).toBeGreaterThan(0);
  });

  it('成功で 取り消した 攻撃の attackHit は 出ない', () => {
    const { m, step, hits, player } = rig();
    const id = m.spawn('karakasa', player.position.x, 9, player.position.z - 1.5, { ai: false });
    const r = m.attackNow(id) as { hitInSteps: number };
    expect(r.hitInSteps).toBeGreaterThan(0);
    m.takeHookEvents();
    step(Math.floor(r.hitInSteps / 2));
    m.applyStagger(id, 'parry');
    step(r.hitInSteps + 5);
    expect(m.takeHookEvents().filter((e: any) => e.type === 'attackHit')).toHaveLength(0);
    expect(hits).toHaveLength(0);
  });

  it('attackNow: ai が false でも 攻撃が 始まる。できない（倒れかけ）は null', () => {
    const { m, step, player } = rig();
    const id = m.spawn('karakasa', player.position.x, 9, player.position.z - 1.5, { ai: false });
    m.takeHookEvents();
    expect(m.attackNow(id)).not.toBeNull();
    step();
    expect(m.takeHookEvents().some((e: any) => e.type === 'attackStart')).toBe(true);
    m.setHp(id, 0);
    step();
    expect(m.attackNow(id)).toBeNull();
  });
});

describe('AC11: 火の玉の はね返し', () => {
  /** ちょうちんが 火の玉を 投げた ところまで 進める */
  function thrown(o: { m?: number } = {}) {
    const r = rig();
    const { m, step, player } = r;
    const id = m.spawn('chochin', player.position.x, 9 + 3, player.position.z - 5, { ai: false, m: o.m ?? 1 });
    m.setHp(id, 5);
    const a = m.attackNow(id) as { hitInSteps: number };
    for (let i = 0; i < a.hitInSteps + 2 && m.fireballList().length === 0; i++) step();
    expect(m.fireballList(), '火の玉が 出た').toHaveLength(1);
    return { ...r, id };
  }
  const centerOf = (y: any) => ({ x: y.position.x, y: y.position.y + (KIND_AI.chochin.height * y.scale) / 2, z: y.position.z });
  const angleBetween = (a: Vec3, b: Vec3) => {
    const la = Math.hypot(a.x, a.y, a.z);
    const lb = Math.hypot(b.x, b.y, b.z);
    return (Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb)))) * 180) / Math.PI;
  };

  it('ちょうちんが いれば その 当たりの箱の まん中へ（ずれ 0.5° 以内）。速さ 10', () => {
    const { m, step, info, id } = thrown();
    const before = m.fireballList()[0];
    expect(before.reflected).toBe(false);
    expect(before.speed).toBeCloseTo(5, 6);
    expect(m.reflectFireball(0)).toBe(true);
    const fb = m.fireballList()[0];
    expect(fb.reflected).toBe(true);
    expect(fb.speed).toBeCloseTo(S.reflectFireball.speed, 6);
    const c = centerOf(info(id));
    const want = { x: c.x - fb.position.x, y: c.y - fb.position.y, z: c.z - fb.position.z };
    expect(angleBetween(fb.dir, want)).toBeLessThanOrEqual(0.5);
    step();
  });

  it('ちょうちんが いなければ 来た向きの 逆。はね返した所から 8 ブロックで 消える', () => {
    const { m, step, id } = thrown();
    const before = m.fireballList()[0];
    m.setHp(id, 0);
    step();
    expect(m.reflectFireball(0)).toBe(true);
    const fb = m.fireballList()[0];
    expect(angleBetween(fb.dir, { x: -before.dir.x, y: -before.dir.y, z: -before.dir.z })).toBeLessThanOrEqual(0.5);
    const start = { ...fb.position };
    let last = start;
    for (let i = 0; i < 200 && m.fireballList().length > 0; i++) {
      last = { ...m.fireballList()[0].position };
      step();
    }
    expect(m.fireballList(), '消えた').toHaveLength(0);
    expect(Math.hypot(last.x - start.x, last.y - start.y, last.z - start.z)).toBeGreaterThan(S.reflectFireball.range - 0.3);
    expect(Math.hypot(last.x - start.x, last.y - start.y, last.z - start.z)).toBeLessThanOrEqual(S.reflectFireball.range + 0.01);
  });

  it('プレイヤーの 箱に 重なっても ダメージなし。妖怪へは 火の玉の強さ。よろける', () => {
    for (const mm of [1, 2]) {
      const { m, step, hits, info, id } = thrown({ m: mm });
      const attack = info(id).attack;
      expect(m.reflectFireball(0)).toBe(true);
      m.takeHookEvents();
      for (let i = 0; i < 90 && m.fireballList().length > 0; i++) step();
      expect(hits, 'プレイヤーに 当たらない').toHaveLength(0);
      expect(5 - info(id).hp, `M=${mm}: ダメージ = 火の玉の強さ`).toBeCloseTo(attack, 6);
      expect(m.stagger(id), 'よろける').not.toBeNull();
    }
  });

  it('よろけ中の ちょうちんには 2 倍', () => {
    const { m, step, info, id } = thrown();
    const attack = info(id).attack;
    m.setHp(id, 20);
    m.applyStagger(id, 'parry');
    expect(m.reflectFireball(0)).toBe(true);
    for (let i = 0; i < 90 && m.fireballList().length > 0; i++) step();
    expect(20 - info(id).hp).toBeCloseTo(attack * 2, 6);
  });
});
