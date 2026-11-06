import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, PlayerCombat, TimeOfDay, Vec3, YokaiKind } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { SENSE } from './senseTuning';
import { YokaiManager } from './YokaiManager';
import { createYokaiConfig, type YokaiConfig } from './config';
import type { YokaiManagerOptions } from './managerTypes';

/**
 * COOP-1 作業 3a（#416）の 先行テスト（赤）。AC39（近い方を 追う・消える 距離）・AC40（パッドが ぬけた 2P は ねらわない）・AC41（同時の 数）・AC45 の 「だれが たおしたか」。
 * 数は 決め打ちせず `createYokaiConfig()` と 感知の 表（SENSE）から 読む（#311）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   YokaiManagerOptions.partner?: () => { position: Vec3; targetable: boolean } | null
 *     … 仲間（2P）。null / なし = 1 人のときと 同じ。targetable=false（パッドが ぬけている）の 2P は ねらわない・数えない。
 *     - ねらう 相手: 1P と（targetable な）2P の うち 近い方（同じ 近さなら 1P）。気づく・追う・あきらめる の 距離は 今の 感知の 表のまま、その 相手との 距離で 決める。
 *     - 消える（farTick）: 気づける 全員から 64 マスより 遠いとき。targetable=false の 2P は 数えない。
 *     - 出る 場所: プレイヤーごと（地上・地下は その人の 足もとで 決める）。出る 位置は いま 数が 少ない方の まわり（同じなら 1P）。
 *     - 数: 「その人の まわり」＝その 妖怪から いちばん 近い プレイヤー。プレイヤーごとの 上限 = 地上なら yokaiMax・地下なら yokaiMaxUnder（今の 値のまま）、
 *       世界全体 = 新しい 設定 `YokaiConfig.yokaiMaxTotal`（`createYokaiConfig` の 1 か所。いま 5）。どちらかの 上限に 届いていたら 出さない。
 *     - 妖怪の ダメージ・つかまえる 相手は 今の まま（combat は 1P の 物。2P が 受ける ダメージは 別の 子 issue）。
 *   YokaiManager.damage(id, amount, from, knock?, by = 'player', who: 1 | 2 = 1)  … 6 つめの 引数。たおしたら onDefeat(kind, info) の info.by = who（DefeatInfo に `by: 1 | 2` を 足す）。
 */

const SIZE = { x: 200, y: 40, z: 64 };
const WIDE_Z = 32.5;

function makeTime(phase: DayPhase): TimeOfDay {
  const t = { dayTick: () => 0, day: () => 0, phase: () => phase, skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} };
  return t;
}
function makeCombat(): PlayerCombat {
  const c: PlayerCombat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] };
  return c;
}
const inv = { add: () => 0 } as unknown as Inventory;

interface Partner {
  position: Vec3;
  targetable: boolean;
}
interface Rig {
  m: YokaiManager;
  p1: { position: Vec3 };
  p2: Partner;
  step(n?: number): void;
}

function flat(): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld(SIZE);
  w.fill(0, 8, 0, SIZE.x - 1, 8, SIZE.z - 1, 'stone');
  return w;
}

function rig(o: { p1: Vec3; p2: Vec3 | null; targetable?: boolean; config?: Partial<YokaiConfig>; world?: ArrayVoxelWorld; extra?: Partial<YokaiManagerOptions> }): Rig {
  const p1 = { position: { ...o.p1 } };
  const p2: Partner = { position: { ...(o.p2 ?? { x: 0, y: 0, z: 0 }) }, targetable: o.targetable ?? true };
  const config = { ...createYokaiConfig(), yokaiAutoSpawn: false, yokaiWander: false, ...o.config } as YokaiConfig;
  const m = new YokaiManager({
    world: o.world ?? flat(),
    time: makeTime('night'),
    getPlayer: () => p1,
    combat: makeCombat(),
    inventory: inv,
    seed: 5,
    config,
    ...(o.p2 ? { partner: () => p2 } : {}),
    ...o.extra,
  } as YokaiManagerOptions);
  return { m, p1, p2, step: (n = 1) => void Array.from({ length: n }, () => m.update(1 / 60)) };
}

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);
const SIGHT = SENSE.kinds.karakasa.sight;
const FOUND: ReadonlySet<string> = new Set(['chase', 'attack', 'search', 'retreat']);

describe('AC39: 妖怪は 近い方の プレイヤーを 追う', () => {
  it('2P の ほうが 近い（2P まで 視界の 半分・1P まで 2 倍）→ 2P に 近づく', () => {
    const X = 100.5;
    const r = rig({ p1: { x: X - SIGHT * 0.9, y: 9, z: WIDE_Z }, p2: { x: X + SIGHT * 0.4, y: 9, z: WIDE_Z } });
    const id = r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    const start2 = dist(r.p2.position, { x: X, y: 9, z: WIDE_Z });
    r.step(150);
    const y = r.m.list().find((e) => e.id === id)!;
    expect(dist(y.position, r.p2.position), '2P に 近づいた').toBeLessThan(start2 - 2);
    expect(dist(y.position, r.p2.position)).toBeLessThan(dist(y.position, r.p1.position));
    expect(FOUND.has(y.state)).toBe(true);
  });
  it('1P の ほうが 近ければ 1P に 近づく（対照）', () => {
    const X = 100.5;
    const r = rig({ p1: { x: X - SIGHT * 0.4, y: 9, z: WIDE_Z }, p2: { x: X + SIGHT * 0.9, y: 9, z: WIDE_Z } });
    const id = r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    const start1 = dist(r.p1.position, { x: X, y: 9, z: WIDE_Z });
    r.step(150);
    const y = r.m.list().find((e) => e.id === id)!;
    expect(dist(y.position, r.p1.position)).toBeLessThan(start1 - 2);
    expect(dist(y.position, r.p1.position)).toBeLessThan(dist(y.position, r.p2.position));
  });
  it('1P から 遠い（視界の 外）・2P から 近い 妖怪も 2P に 気づいて 追う', () => {
    const X = 100.5;
    const r = rig({ p1: { x: X - SIGHT * 2.5, y: 9, z: WIDE_Z }, p2: { x: X + SIGHT * 0.5, y: 9, z: WIDE_Z } });
    const id = r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    r.step(120);
    const y = r.m.list().find((e) => e.id === id)!;
    expect(FOUND.has(y.state)).toBe(true);
  });
});

describe('AC39: 消える 距離は 2 人の 両方から 遠いとき（1P から 70 マス・2P から 10 マスの 妖怪は 消えない）', () => {
  const spawnFar = (r: Rig, x: number) => r.m.spawn('karakasa', x, 9, WIDE_Z, { ai: false });
  it('1P から 70・2P から 10 → 消えない', () => {
    const X = 100.5;
    const r = rig({ p1: { x: X - 70, y: 9, z: WIDE_Z }, p2: { x: X - 10, y: 9, z: WIDE_Z } });
    const id = spawnFar(r, X);
    r.step(5);
    expect(r.m.list().map((e) => e.id)).toContain(id);
  });
  it('2P が いなければ（1 人）同じ 妖怪は 消える（今までどおり）', () => {
    const X = 100.5;
    const r = rig({ p1: { x: X - 70, y: 9, z: WIDE_Z }, p2: null });
    const id = spawnFar(r, X);
    r.step(5);
    expect(r.m.list().map((e) => e.id)).not.toContain(id);
  });
  it('2 人の 両方から 64 より 遠ければ 消える', () => {
    const X = 150.5;
    const r = rig({ p1: { x: X - 70, y: 9, z: WIDE_Z }, p2: { x: X - 66, y: 9, z: WIDE_Z } });
    const id = spawnFar(r, X);
    r.step(5);
    expect(r.m.list().map((e) => e.id)).not.toContain(id);
  });
  it('パッドが ぬけた 2P の そばでは 消える（数えない）', () => {
    const X = 100.5;
    const r = rig({ p1: { x: X - 70, y: 9, z: WIDE_Z }, p2: { x: X - 10, y: 9, z: WIDE_Z }, targetable: false });
    const id = spawnFar(r, X);
    r.step(5);
    expect(r.m.list().map((e) => e.id)).not.toContain(id);
  });
});

describe('AC40: 2P の パッドが ぬけている あいだ、妖怪は 2P を ねらわない。つなぎ直すと また ねらう', () => {
  it('2P の 近くの 妖怪は ぬけている あいだ 気づかない・追わない。つなぎ直すと 追いはじめる', () => {
    const X = 100.5;
    const r = rig({ p1: { x: X - SIGHT * 2.5, y: 9, z: WIDE_Z }, p2: { x: X + SIGHT * 0.4, y: 9, z: WIDE_Z }, targetable: false });
    const id = r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    for (let i = 0; i < 400; i++) {
      r.step(1);
      const y = r.m.list().find((e) => e.id === id)!;
      expect(FOUND.has(y.state), `ステップ ${i}: ${y.state}`).toBe(false);
    }
    r.p2.targetable = true;
    let found = false;
    for (let i = 0; i < 120 && !found; i++) {
      r.step(1);
      found = FOUND.has(r.m.list().find((e) => e.id === id)!.state);
    }
    expect(found).toBe(true);
  });
  it('2P の 近くの 妖怪が 1P にも 気づける ときは 1P を 追う（2P の ほうが 近くても）', () => {
    const X = 100.5;
    const r = rig({ p1: { x: X - SIGHT * 0.8, y: 9, z: WIDE_Z }, p2: { x: X + SIGHT * 0.3, y: 9, z: WIDE_Z }, targetable: false });
    const id = r.m.spawn('karakasa', X, 9, WIDE_Z, { ai: true });
    const start1 = dist(r.p1.position, { x: X, y: 9, z: WIDE_Z });
    r.step(150);
    const y = r.m.list().find((e) => e.id === id)!;
    expect(dist(y.position, r.p1.position)).toBeLessThan(start1 - 2);
  });
});

// ------------------------------------------------------------------ AC41

const GROUND = 150;
const RS = { x: 96, y: 200, z: 96 };
/** 地面 150 まで 石。大部屋（足 60）が 1 つ。1P は 地上（足 151）、2P は 部屋の 中（足 60 = 地下） */
function deepWorld(): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld(RS);
  w.fill(0, 0, 0, RS.x - 1, GROUND, RS.z - 1, 'stone');
  w.fill(18, 60, 18, 77, 63, 77, 'air');
  return w;
}

describe('AC41: 妖怪の 同時の 数は プレイヤーごとの 上限と 世界全体の 上限を こえない（数は createYokaiConfig から 読む）', () => {
  const FAST: Partial<YokaiConfig> = { yokaiSpawnInterval: 1, yokaiSpawnIntervalUnder: 1, yokaiForgetSteps: 1e9, yokaiAutoSpawn: true };

  /** 数えるのは「いちばん 近い プレイヤー」ごと。水平だけでなく 高さも 入れた 3 次元の 近さ */
  function counts(r: Rig): { n1: number; n2: number; total: number } {
    let n1 = 0;
    let n2 = 0;
    for (const e of r.m.list()) {
      const d1 = Math.hypot(e.position.x - r.p1.position.x, e.position.y - r.p1.position.y, e.position.z - r.p1.position.z);
      const d2 = Math.hypot(e.position.x - r.p2.position.x, e.position.y - r.p2.position.y, e.position.z - r.p2.position.z);
      if (d2 < d1) n2++;
      else n1++;
    }
    return { n1, n2, total: r.m.list().length };
  }

  it('設定の 形: 世界全体の 上限が あり、1 人の 上限より 大きく、2 人分より 少ない（全体の 上限が 効く 形）', () => {
    const c = createYokaiConfig() as unknown as Record<string, unknown>;
    const total = c.yokaiMaxTotal;
    expect(typeof total).toBe('number');
    expect(total as number).toBeGreaterThan(createYokaiConfig().yokaiMax);
    expect(total as number).toBeLessThan(createYokaiConfig().yokaiMax * 2);
  });

  it('2 人が 離れていて 地上と 地下に 分かれても、それぞれ 上限以下・全体も 上限以下。全体は 上限まで 出る', () => {
    const config = createYokaiConfig() as YokaiConfig & { yokaiMaxTotal: number };
    const r = rig({
      p1: { x: 10.5, y: GROUND + 1, z: 10.5 },
      p2: { x: 60.5, y: 60, z: 60.5 },
      world: deepWorld(),
      config: FAST,
      extra: { groundY: () => GROUND },
    });
    let peak = 0;
    for (let i = 0; i < 4000; i++) {
      r.step(1);
      const c = counts(r);
      expect(c.n1, `1P の まわり（地上）ステップ ${i}`).toBeLessThanOrEqual(config.yokaiMax);
      expect(c.n2, `2P の まわり（地下）ステップ ${i}`).toBeLessThanOrEqual(config.yokaiMaxUnder);
      expect(c.total, `全体 ステップ ${i}`).toBeLessThanOrEqual(config.yokaiMaxTotal);
      peak = Math.max(peak, c.total);
    }
    expect(peak, '2 人分 出る（1 人の 上限を こえて 全体の 上限まで）').toBe(Math.min(config.yokaiMax + config.yokaiMaxUnder, config.yokaiMaxTotal));
  });

  it('2P の まわりにも 出る（1P の 上限が 埋まっても 2P の ぶんは 出る）', () => {
    const r = rig({
      p1: { x: 10.5, y: GROUND + 1, z: 10.5 },
      p2: { x: 60.5, y: 60, z: 60.5 },
      world: deepWorld(),
      config: FAST,
      extra: { groundY: () => GROUND },
    });
    let seen2 = 0;
    for (let i = 0; i < 4000; i++) {
      r.step(1);
      seen2 = Math.max(seen2, counts(r).n2);
    }
    expect(seen2).toBeGreaterThan(0);
  });

  it('1 人のとき（2P なし）は 今までどおり 1 人の 上限だけ', () => {
    const config = createYokaiConfig();
    const r = rig({ p1: { x: 10.5, y: GROUND + 1, z: 10.5 }, p2: null, world: deepWorld(), config: FAST, extra: { groundY: () => GROUND } });
    let peak = 0;
    for (let i = 0; i < 3000; i++) {
      r.step(1);
      peak = Math.max(peak, r.m.list().length);
      expect(r.m.list().length).toBeLessThanOrEqual(config.yokaiMax);
    }
    expect(peak).toBe(config.yokaiMax);
  });
});

describe('AC45（たおした人）: たおしたら onDefeat の info.by が さいごの 1 発を 当てた人', () => {
  function killed(who?: 1 | 2): number | undefined {
    const seen: Array<{ by?: number }> = [];
    const r = rig({
      p1: { x: 20.5, y: 9, z: WIDE_Z },
      p2: { x: 24.5, y: 9, z: WIDE_Z },
      extra: { onDefeat: ((_k: YokaiKind, info: { by?: number }) => seen.push(info)) as never },
    });
    const id = r.m.spawn('karakasa', 30.5, 9, WIDE_Z, { ai: false });
    const dmg = r.m.damage as (id: number, amount: number, from: Vec3, knock?: undefined, by?: 'player', who?: 1 | 2) => number;
    dmg.call(r.m, id, 9999, { x: 24.5, y: 9, z: WIDE_Z }, undefined, 'player', who);
    r.step(200);
    return seen[0]?.by;
  }
  it('2P が たおした → by = 2', () => {
    expect(killed(2)).toBe(2);
  });
  it('1P が たおした・指定なし → by = 1（今までの 呼びかたは 1P）', () => {
    expect(killed(1)).toBe(1);
    expect(killed()).toBe(1);
  });
});
