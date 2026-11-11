import { describe, expect, it } from 'vitest';
import { YOKAI_DEFS } from '../../content/yokai/registry';
import type { DayPhase, Inventory, PlayerCombat, TimeOfDay, Vec3, YokaiKind } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { HP_BAR } from './hpBar';
import { createYokaiConfig, type YokaiConfig } from './config';
import { YokaiManager } from './YokaiManager';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.16 §3.7 (g) #21・#22b、AC178・AC146）のユニットテスト。実装の前に書いた赤のテスト。
 * 妖怪の 名札（二つ名の 名前）は 1P の 足もとから 16 ブロック 以内の 妖怪だけ（`nameplates()` は 1P を 基準）。2P の 半分に だけ 映る 妖怪の 名札は 今は 出ない。
 * すみで 暗くなる 板（`#ink-dim`）の こさ（`inkDim()`）は 1P の 目だけで 決まる。2 人の ときは すみを かぶった 人の 半分だけ 暗くする。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   YokaiManager.nameplates(out?, who: 1 | 2 = 1)   … who の 足もとから HP_BAR.titleRange 以内の 二つ名の 妖怪。`dist` も who の 足もとから。who を 省くと 今まで どおり 1P（1 人の ときは 何も かわらない）。
 *       2P が いない（partner が null）で who = 2 は 空。ねらえない（倒れている・パッドが ぬけた）2P でも 画面は 2P の 半分に 出る ので `targetable` は 見ない（位置だけ 見る）。
 *   YokaiManager.inkDim(who: 1 | 2 = 1)             … who の 目が すみの けむりの 中に ある ときの 暗さ（0〜1）。省くと 1P（今まで どおり）。
 *       暗さの 上がり・下がり（DIM_RISE_STEPS・dimFadeOutSeconds）は 人ごとに 数える。2P が いなければ who = 2 は 0。
 *   `inkInfo().dim` は 1P の まま（窓口は かえない）。
 */

const SIZE = { x: 200, y: 40, z: 64 };
const Z = 32.5;
const TITLE_RANGE = HP_BAR.titleRange;

const time = (phase: DayPhase): TimeOfDay =>
  ({ dayTick: () => 0, day: () => 0, phase: () => phase, skyColor: () => '#000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} }) as unknown as TimeOfDay;
const combat = (): PlayerCombat => ({ hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] });
const inv = { add: () => 0 } as unknown as Inventory;

function flat(): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld(SIZE);
  w.fill(0, 8, 0, SIZE.x - 1, 8, SIZE.z * 2 - 1, 'stone');
  return w;
}

function rig(p1: Vec3, p2: Vec3 | null, targetable = true) {
  const a = { position: { ...p1 } };
  const b = { position: { ...(p2 ?? { x: 0, y: 0, z: 0 }) }, targetable, hurt: () => true };
  const config = { ...createYokaiConfig(), yokaiAutoSpawn: false, yokaiWander: false } as YokaiConfig;
  const m = new YokaiManager({ world: flat(), time: time('night'), getPlayer: () => a, combat: combat(), inventory: inv, seed: 5, config, ...(p2 ? { partner: () => b } : {}) });
  return { m, a, b, step: (n = 1) => void Array.from({ length: n }, () => m.update(1 / 60)) };
}

describe('#21: 妖怪の 名札は 人ごとの 足もとから（nameplates(out, who)）', () => {
  const X = 100.5;
  it('2P の 足もとの 近くの 二つ名の 妖怪: who=2 には 出て、1P（遠い）には 出ない', () => {
    const r = rig({ x: X - (TITLE_RANGE + 12), y: 9, z: Z }, { x: X - 3, y: 9, z: Z });
    const id = r.m.spawn('karakasa', X, 9, Z, { ai: false, title: 'nushi', m: 1 });
    r.step(2);
    const p2 = r.m.nameplates([], 2);
    expect(p2.map((p) => p.id)).toContain(id);
    expect(r.m.nameplates([], 1).map((p) => p.id)).not.toContain(id);
    // who を 省くと 今まで どおり 1P
    expect(r.m.nameplates().map((p) => p.id)).not.toContain(id);
  });
  it('1P の 足もとの 近くの 妖怪: who=1（と 省略）には 出て、who=2（遠い）には 出ない', () => {
    const r = rig({ x: X - 3, y: 9, z: Z }, { x: X + TITLE_RANGE + 12, y: 9, z: Z });
    const id = r.m.spawn('karakasa', X, 9, Z, { ai: false, title: 'nushi', m: 1 });
    r.step(2);
    expect(r.m.nameplates([], 1).map((p) => p.id)).toContain(id);
    expect(r.m.nameplates().map((p) => p.id)).toContain(id);
    expect(r.m.nameplates([], 2).map((p) => p.id)).not.toContain(id);
  });
  it('dist は その 人の 足もとから（2P の 名札は 2P までの きょり）', () => {
    const r = rig({ x: X - 10, y: 9, z: Z }, { x: X - 4, y: 9, z: Z });
    r.m.spawn('karakasa', X, 9, Z, { ai: false, title: 'nushi', m: 1 });
    r.step(2);
    expect(r.m.nameplates([], 1)[0]!.dist).toBeCloseTo(10, 0);
    expect(r.m.nameplates([], 2)[0]!.dist).toBeCloseTo(4, 0);
  });
  it('倒れている（ねらえない）2P の 半分にも 名札は 出る（位置だけ 見る）', () => {
    const r = rig({ x: X - (TITLE_RANGE + 12), y: 9, z: Z }, { x: X - 3, y: 9, z: Z }, false);
    const id = r.m.spawn('karakasa', X, 9, Z, { ai: false, title: 'nushi', m: 1 });
    r.step(2);
    expect(r.m.nameplates([], 2).map((p) => p.id)).toContain(id);
  });
  it('2P が いない: who=2 は 空。1P は 今まで どおり', () => {
    const r = rig({ x: X - 3, y: 9, z: Z }, null);
    r.m.spawn('karakasa', X, 9, Z, { ai: false, title: 'nushi', m: 1 });
    r.step(2);
    expect(r.m.nameplates([], 2)).toEqual([]);
    expect(r.m.nameplates([], 1)).toHaveLength(1);
  });
  it('二つ名の ない 妖怪は だれにも 出ない', () => {
    const r = rig({ x: X - 3, y: 9, z: Z }, { x: X + 3, y: 9, z: Z });
    r.m.spawn('karakasa', X, 9, Z, { ai: false });
    r.step(2);
    expect(r.m.nameplates([], 1)).toEqual([]);
    expect(r.m.nameplates([], 2)).toEqual([]);
  });
});

describe('#22b: すみの 暗さは 人ごと（inkDim(who)）', () => {
  const SW = YOKAI_DEFS.tako_hachimaki.swim!;
  const KIND: YokaiKind = 'tako_hachimaki';

  /** 水の 池: 床 y=8・水 y 9〜14。x 0〜40・z 0〜40 */
  function pool(p1: Vec3, p2: Vec3 | null) {
    const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
    for (let x = 0; x <= 40; x++) {
      for (let z = 0; z <= 40; z++) {
        world.setBlock(x, 8, z, 'stone');
        for (let y = 9; y <= 14; y++) world.setBlock(x, y, z, 'water');
      }
    }
    const a = { position: { ...p1 } };
    const b = { position: { ...(p2 ?? { x: 0, y: 0, z: 0 }) }, targetable: true, hurt: () => true };
    const config = { ...createYokaiConfig(), yokaiAutoSpawn: false, yokaiWander: false } as YokaiConfig;
    const m = new YokaiManager({ world, time: time('day'), getPlayer: () => a, combat: combat(), inventory: inv, seed: 1, config, ...(p2 ? { partner: () => b } : {}) });
    const step = (n = 1) => void Array.from({ length: n }, () => m.update(1 / 60));
    return { m, a, b, step };
  }

  /** たこが すみを はくまで 近くで まつ → けむりの 中心を 返す */
  function inkCloud(r: ReturnType<typeof pool>) {
    r.m.spawn(KIND, 20.5, 11.5, 20.5, { ai: true });
    for (let i = 0; i < 90 && r.m.inkInfo().clouds.length === 0; i++) r.step(1);
    return r.m.inkInfo().clouds[0];
  }

  it('2P の 目だけ けむりの 中: inkDim(2) は 上がり、inkDim(1)（と 省略）は 0 のまま', () => {
    const r = pool({ x: 20.5, y: 14.2, z: 22 }, { x: 20.5, y: 14.2, z: 22.5 });
    const c = inkCloud(r)!;
    expect(c).toBeDefined();
    // 1P は 遠く、2P は けむりの 中心
    r.a.position.x = c.x + 30;
    r.a.position.z = c.z;
    r.b.position.x = c.x;
    r.b.position.z = c.z;
    r.b.position.y = c.y - 1.62;
    r.step(15);
    expect(r.m.inkDim(2)).toBeCloseTo(SW.dimAlpha, 9);
    expect(r.m.inkDim(1)).toBe(0);
    expect(r.m.inkDim()).toBe(0);
  });
  it('1P の 目だけ けむりの 中: inkDim(1)・inkDim() は 上がり、inkDim(2) は 0（今まで どおり 1P）', () => {
    const r = pool({ x: 20.5, y: 14.2, z: 22 }, { x: 20.5, y: 14.2, z: 22.5 });
    const c = inkCloud(r)!;
    r.b.position.x = c.x + 30;
    r.b.position.z = c.z;
    r.a.position.x = c.x;
    r.a.position.z = c.z;
    r.a.position.y = c.y - 1.62;
    r.step(15);
    expect(r.m.inkDim(1)).toBeCloseTo(SW.dimAlpha, 9);
    expect(r.m.inkDim()).toBeCloseTo(SW.dimAlpha, 9);
    expect(r.m.inkDim(2)).toBe(0);
  });
  it('両方 かぶれば 両方 暗い。外へ 出れば その人だけ 0 秒 〜 dimFadeOutSeconds で 0', () => {
    const r = pool({ x: 20.5, y: 14.2, z: 22 }, { x: 20.5, y: 14.2, z: 22.5 });
    const c = inkCloud(r)!;
    for (const p of [r.a.position, r.b.position]) {
      p.x = c.x;
      p.z = c.z;
      p.y = c.y - 1.62;
    }
    r.step(15);
    expect(r.m.inkDim(1)).toBeCloseTo(SW.dimAlpha, 9);
    expect(r.m.inkDim(2)).toBeCloseTo(SW.dimAlpha, 9);
    r.b.position.x = c.x + 30;
    r.step(Math.round(SW.dimFadeOutSeconds * 60) + 1);
    expect(r.m.inkDim(2)).toBe(0);
    expect(r.m.inkDim(1)).toBeCloseTo(SW.dimAlpha, 9);
  });
  it('2P が いない: inkDim(2) は 0・inkDim(1) は 今まで どおり', () => {
    const r = pool({ x: 20.5, y: 14.2, z: 22 }, null);
    const c = inkCloud(r)!;
    r.a.position.x = c.x;
    r.a.position.z = c.z;
    r.a.position.y = c.y - 1.62;
    r.step(15);
    expect(r.m.inkDim(2)).toBe(0);
    expect(r.m.inkDim()).toBeCloseTo(SW.dimAlpha, 9);
  });
});
