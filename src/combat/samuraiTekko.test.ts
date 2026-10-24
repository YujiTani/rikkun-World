import { afterEach, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import type { ArmorSlot, ItemId, Vec3, YokaiInfo, YokaiWorld } from '../contracts';
import { createW2Settings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { YokaiManager } from '../yokai/ai/YokaiManager';
import { NINJA_TUNING } from '../craft/ninjaTuning';
import { tekkoBladeMulOf, tekkoDefIgnoreOf } from '../craft/samuraiPower';
import { TOOL_DEFAULTS } from '../tools/config';
import { techDamage } from '../tools/blade/BladeSystem';
import { legendPowerOf } from '../legend/defs';
import { createLegendSystem, type LegendStepCtx } from '../legend/LegendSystem';
import { createWaveSystem, type WaveStepCtx } from '../legend/WaveSystem';
import { buildBig, worldHits } from '../proto/gashaBig';
import { BigHit, damageOf, type BoxLike } from '../proto/gashaBigHit';
import { TUNE as T } from '../proto/gashaBigTuning';

/**
 * SAMURAI-1（#300）AC10〜AC13: 明珍手甲（刀 × 1.5・防御力 10 無視）。実装の 前の テスト（赤）。
 * 窓口 の 形:
 *   samuraiPower.ts  `tekkoBladeMulOf(armor, item)` = 手甲を 着て いて item が 刀（BLADE_ITEMS）なら 調整表 tekkoBladeMul（1.5）、ほかは 1
 *                    （素手 null・弓・なぎなた・きんの つるはし／おの は 1）。main.ts の `weaponDamage`（ほかに がしゃどくろ へ の つなぎ）が この 倍率を かける
 *                    `tekkoDefIgnoreOf(armor)` = 手甲を 着て いれば 調整表 tekkoDefIgnore（10）、ほかは 0
 *   WaveSystem / LegendSystem   `deps.powerMul?: (item: ItemId | null) => number`（強さ P に かける。強さを 決める 時に 1 回: 真空波・らせん = 出した とき、雷 = 落ちる とき、ドーム = 始めた とき）
 *   gashaBigHit.ts  `damageOf(part, amount, defIgnore = 0)` = 最低 1（amount × 部位倍率 − max(0, 防御力 − defIgnore))。倍率 0 の 部位は 0。防御力を ひく 所は ここ 1 か所
 *                   `HitEnv.defIgnore?(): number`（手甲の 無視。BigHit が 刀の 当たり blade・wave・strike・dome に だけ かける。矢・パンチ ray には かけない）
 */
const S = createW2Settings();
const wearing = (arms: ItemId | null) => ({ equipped: (slot: ArmorSlot): ItemId | null => (slot === 'arms' ? arms : null) });
const TEKKO = wearing('samurai_tekko' as ItemId);
const NONE = wearing(null);

/** 刀の 強さ（main.ts の weaponDamage と 同じ 作り: 刀の 強さ × 手甲の 倍率）。niji は 1 本ごとの 強さ */
const base = (item: ItemId, nijiPower = 7): number => legendPowerOf(S, item, item === 'niji' ? nijiPower : null) ?? (TOOL_DEFAULTS.weaponDamage as Record<string, number>)[item] ?? 1;
const strength = (armor: ReturnType<typeof wearing>, item: ItemId, nijiPower = 7): number => base(item, nijiPower) * tekkoBladeMulOf(armor, item);
const tech = (armor: ReturnType<typeof wearing>, item: ItemId, t: 'thrust' | 'kesa' | 'kiriage', nijiPower = 7) => techDamage(strength(armor, item, nijiPower), S.bladeDamageMul[t]);

describe('AC10 手甲 × ふつうの 妖怪（刀の 強さ × 1.5）', () => {
  it('体力 20 の からかさ を かたな の けさぎり: 手甲 なしで 10、手甲で 15 へる', () => {
    expect(tech(NONE, 'katana', 'kesa')).toBe(10);
    expect(tech(TEKKO, 'katana', 'kesa')).toBe(15);
  });
  it('木刀の つき: 2 × 1.5 × 0.75 = 2.25（0.01 の 位。整数に まるめない）。かたなの つき 4 → 6 × 0.75 = 4.5', () => {
    expect(tech(TEKKO, 'bokuto', 'thrust')).toBe(2.25);
    expect(tech(NONE, 'bokuto', 'thrust')).toBe(1.5);
    expect(tech(TEKKO, 'katana', 'thrust')).toBe(4.5);
  });
  it('虹（強さ 7）の けさぎり → 26.25。きんの かたな 5 → 7.5', () => {
    expect(tech(TEKKO, 'niji', 'kesa', 7)).toBe(26.25);
    expect(strength(TEKKO, 'kin_katana')).toBe(7.5);
    expect(strength(TEKKO, 'crystal_katana')).toBe(6);
  });
  it('雷神剣 8 → 12・風神剣 6 → 9（レジェンダリーも 刀）', () => {
    expect(strength(TEKKO, 'raijin_ken')).toBe(12);
    expect(strength(TEKKO, 'fujin_ken')).toBe(9);
  });
  it('よろけ 中の 子 に かたな けさぎり → 与えた 数 30（1.5 の あとに よろけの 2 倍。1.5 × 2 = 3 倍）', () => {
    const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
    for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) world.setBlock(x, 8, z, 'stone');
    const time = { dayTick: () => 0, day: () => 0, phase: () => 'day', skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} };
    const combat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] };
    const inventory = { add: () => 0 };
    const m = new YokaiManager({ world, time, getPlayer: () => ({ position: { x: 2.5, y: 9, z: 6.5 } }), combat, inventory, seed: 1 } as never);
    m.config.yokaiAutoSpawn = false;
    m.config.yokaiWander = false;
    const id = m.spawn('karakasa', 4.5, 9, 6.5, { ai: false });
    m.setHp(id, 99);
    expect(m.applyStagger(id, 'parry')).toBe(true);
    const dealt = m.damage(id, tech(TEKKO, 'katana', 'kesa'), { x: 2.5, y: 9, z: 6.5 });
    expect(dealt).toBe(30);
    expect(m.list().find((y) => y.id === id)!.hp).toBe(69);
  });
  it('tekkoBladeMul を 2 に する → かたな けさぎり 20（調整表の 数を そのまま つかう）', () => {
    const saved = NINJA_TUNING.tekkoBladeMul;
    try {
      NINJA_TUNING.tekkoBladeMul = 2;
      expect(tech(TEKKO, 'katana', 'kesa')).toBe(20);
    } finally {
      NINJA_TUNING.tekkoBladeMul = saved;
    }
    expect(tech(TEKKO, 'katana', 'kesa')).toBe(15);
  });
  it('防具の マスを 見るのは 1 回の 呼び出しで 1 マス（arms）だけ', () => {
    let n = 0;
    const armor = { equipped: (slot: ArmorSlot) => (n++, slot === 'arms' ? ('samurai_tekko' as ItemId) : null) };
    tekkoBladeMulOf(armor, 'katana');
    expect(n).toBe(1);
  });
});

describe('AC11 手甲の 対象外', () => {
  it('素手（null）・弓・なぎなた・きんの つるはし／おの・ふつうの ブロック は 1 倍', () => {
    for (const item of [null, undefined, 'bow', 'naginata', 'kin_pickaxe', 'kin_axe', 'stone_pickaxe', 'dirt'] as (ItemId | null | undefined)[]) {
      expect(tekkoBladeMulOf(TEKKO, item as ItemId), String(item)).toBe(1);
    }
  });
  it('刀 7 本（木刀・かたな・きらめく カタナ・きんの かたな・雷神剣・風神剣・虹）は 1.5 倍', () => {
    for (const item of ['bokuto', 'katana', 'crystal_katana', 'kin_katana', 'raijin_ken', 'fujin_ken', 'niji'] as ItemId[]) {
      expect(tekkoBladeMulOf(TEKKO, item), item).toBe(1.5);
      expect(tekkoBladeMulOf(NONE, item), `${item} 手甲 なし`).toBe(1);
    }
  });
  it('忍びの手甲・ほかの 防具では 1 倍（うでの マスが 侍の 手甲の ときだけ）', () => {
    expect(tekkoBladeMulOf(wearing('ninja_tekko' as ItemId), 'katana')).toBe(1);
    expect(tekkoBladeMulOf(wearing('kote' as ItemId), 'katana')).toBe(1);
  });
  it('防御力の 無視（tekkoDefIgnoreOf）: 手甲 10、ほか 0。調整表の 数を つかう', () => {
    expect(tekkoDefIgnoreOf(TEKKO)).toBe(10);
    expect(tekkoDefIgnoreOf(NONE)).toBe(0);
    expect(tekkoDefIgnoreOf(wearing('ninja_tekko' as ItemId))).toBe(0);
    const saved = NINJA_TUNING.tekkoDefIgnore;
    try {
      NINJA_TUNING.tekkoDefIgnore = 30;
      expect(tekkoDefIgnoreOf(TEKKO)).toBe(30);
    } finally {
      NINJA_TUNING.tekkoDefIgnore = saved;
    }
  });
});

describe('AC12 手甲 × 刀から 出る 物（強さ P × 1.5）', () => {
  const B: Vec3 = { x: 0.5, y: 1.4, z: 0.5 };
  const waveCtx = (over: Partial<WaveStepCtx> = {}): WaveStepCtx => ({ item: 'fujin_ken', tech: 'thrust', phase: 'active', frame: 5, startup: 4, dirDeg: 0, body: B, ...over });
  const waveIdle = waveCtx({ phase: 'idle', tech: null, frame: 0 });

  function waveRig(mul: () => number) {
    const dmg: number[] = [];
    const list = [{ id: 1, kind: 'karakasa', scale: 1, state: 'idle', position: { x: 0.5, y: 0, z: -2 } }] as unknown as YokaiInfo[];
    const w = createWaveSystem({
      world: { isSolid: () => false },
      yokai: () => ({ list: () => list, damage: (_id: number, a: number) => (dmg.push(a), a) }) as never,
      settings: S,
      tick: () => 0,
      emit: () => {},
      powerMul: mul,
      seed: 3,
    } as never);
    return { w, dmg };
  }

  it('風神剣の 真空波: 6 × 0.3 = 1.8 → 手甲で 2.7（0.01 の 位）', () => {
    const a = waveRig(() => 1);
    a.w.step(waveCtx());
    for (let i = 0; i < 20; i++) a.w.step(waveIdle);
    expect(a.dmg).toEqual([1.8]);
    const b = waveRig(() => 1.5);
    b.w.step(waveCtx());
    for (let i = 0; i < 20; i++) b.w.step(waveIdle);
    expect(b.dmg).toEqual([2.7]);
  });
  it('真空波を 出してから 当たる 前に 手甲を ぬいでも 出した ときの 強さ（2.7）の まま', () => {
    let worn = true;
    const r = waveRig(() => (worn ? 1.5 : 1));
    r.w.step(waveCtx()); // 出た
    worn = false;
    for (let i = 0; i < 20; i++) r.w.step(waveIdle);
    expect(r.dmg).toEqual([2.7]);
  });
  it('風神剣の らせん: 6 × 2.0 = 12 → 18。出してから ぬいでも 18', () => {
    const run = (mulAtFire: number, mulAfter: number) => {
      let mul = mulAtFire;
      let tk = 0; // らせんは 生まれた ステップ（bornTick）から 進むので、ステップごとに 進める
      const dmg: number[] = [];
      const list = [{ id: 1, kind: 'karakasa', scale: 1, state: 'idle', position: { x: 0.5, y: 0, z: -3 } }] as unknown as YokaiInfo[];
      const w = createWaveSystem({
        world: { isSolid: () => false },
        yokai: () => ({ list: () => list, damage: (_id: number, a: number) => (dmg.push(a), a) }) as never,
        settings: S,
        tick: () => tk,
        emit: () => {},
        powerMul: () => mul,
        seed: 3,
      } as never);
      w.launchSpiral({ item: 'fujin_ken' as ItemId, dirDeg: 0, body: { x: 0.5, y: 1.4, z: 0.5 } });
      mul = mulAfter;
      for (let i = 0; i < 60; i++) {
        tk++;
        w.step({ ...waveIdle, item: 'fujin_ken' as ItemId });
      }
      return dmg;
    };
    expect(run(1, 1)).toEqual([12]);
    expect(run(1.5, 1.5)).toEqual([18]);
    expect(run(1.5, 1)).toEqual([18]);
  });

  const FLOOR = 8;
  const EYE: Vec3 = { x: 20.5, y: FLOOR + 1 + 1.4, z: 20.5 };
  const POS: Vec3 = { x: 20.5, y: FLOOR + 1, z: 20.5 };
  const GROUND8: Vec3 = { x: 20.5, y: FLOOR + 1, z: 12.5 };
  const karakasa = (id: number, at: Vec3, hp = 99): YokaiInfo =>
    ({ id, kind: 'karakasa', position: { ...at }, yawDeg: 0, hp, maxHp: hp, state: 'idle', attackTick: 0, scale: 1, name: 'x', title: 'none', m: 1, attack: 2 }) as YokaiInfo;
  function legendRig(list: YokaiInfo[], item: ItemId, power: number | undefined, mul: () => number) {
    const world = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
    for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) world.setBlock(x, FLOOR, z, 'stone');
    const hits: { id: number; amount: number }[] = [];
    const yokai = { list: () => list, raycast: () => null, damage: (id: number, amount: number) => (hits.push({ id, amount }), amount) } as unknown as YokaiWorld;
    let tick = 0;
    const sys = createLegendSystem({ world, yokai: () => yokai, settings: S, tick: () => tick, powerMul: mul } as never);
    const dir = { x: GROUND8.x - EYE.x, y: GROUND8.y - EYE.y, z: GROUND8.z - EYE.z };
    const l = Math.hypot(dir.x, dir.y, dir.z);
    const ctx: LegendStepCtx = {
      item, ...(power === undefined ? {} : { power }), active: true, pressed: false, held: false, startOk: true, bladeBusy: false, bladeAccepts: false, bladeChainOpen: false,
      eye: EYE, dir: item === 'niji' ? { x: 0, y: 0, z: -1 } : { x: dir.x / l, y: dir.y / l, z: dir.z / l }, position: POS, yawDeg: 0, inWater: false,
    };
    const step = (o: Partial<LegendStepCtx> = {}) => {
      tick += 1;
      return sys.step({ ...ctx, ...o });
    };
    return { sys, step, hits };
  }
  it('雷神剣の 雷: 8 × 2.0 = 16 → 手甲で 24', () => {
    const run = (mul: number) => {
      const S2 = { x: 20.5, y: FLOOR + 1, z: 12.5 };
      const r = legendRig([karakasa(1, { x: S2.x + 1, y: S2.y, z: S2.z })], 'raijin_ken', undefined, () => mul);
      r.step({ pressed: true, held: true });
      for (let i = 1; i < 60; i++) r.step({ held: true });
      for (let i = 0; i < 12; i++) r.step({ held: false });
      return r.hits.map((h) => h.amount);
    };
    expect(run(1)).toEqual([16]);
    expect(run(1.5)).toEqual([24]);
  });
  it('虹の ドーム: 強さ 10 × 2.5 = 25 → 手甲で 37.5', () => {
    const run = (mul: number) => {
      const r = legendRig([karakasa(1, { x: POS.x + 6.5, y: POS.y, z: POS.z })], 'niji', 10, () => mul);
      r.step({ pressed: true, held: true });
      for (let i = 1; i < 150; i++) r.step({ held: true });
      r.step({ held: false });
      for (let F = 2; F <= 45; F++) r.step();
      return r.hits[0]?.amount;
    };
    expect(run(1)).toBe(25);
    expect(run(1.5)).toBe(37.5);
  });
});

// ---------------------------------------------------------------- AC13 がしゃどくろの 部位の 防御力
function bodyBoxes() {
  const model = buildBig();
  model.group.position.set(0, 0, 0);
  model.group.scale.setScalar(model.scale);
  const boxes = worldHits(model).map((h) => ({ name: h.name, c: h.center, ax: [...h.axes[0], ...h.axes[1], ...h.axes[2]], half: h.half })) as BoxLike[];
  return { boxes, model };
}
function bigRig(defIgnore?: () => number) {
  const { boxes, model } = bodyBoxes();
  const bh = new BigHit({ scene: new Scene(), angry: () => {}, ...(defIgnore ? { defIgnore } : {}) } as never);
  bh.bind(boxes, model);
  return bh;
}

describe('AC13 手甲 × 防御力（#293 の 部位）', () => {
  const saved = { ...T.hit.partDef };
  afterEach(() => Object.assign(T.hit.partDef, saved));

  it('調整表の もとの 数: 手 防御力 30・倍率 1.0、コア 防御力 0・倍率 9', () => {
    expect(T.hit.partDef.hand).toBe(30);
    expect(T.hit.partMul.hand).toBe(1.0);
    expect(T.hit.partDef.core).toBe(0);
    expect(T.hit.partMul.core).toBe(9.0);
  });
  it('damageOf: 手に 強さ 37.5 → 無視 10 で 17.5、無視 なしの 強さ 25 → 1', () => {
    expect(damageOf('hand', 37.5, 10)).toBe(17.5);
    expect(damageOf('hand', 25)).toBe(1);
    expect(damageOf('hand', 25, 0)).toBe(1);
    expect(damageOf('hand', 37.5)).toBe(7.5); // 無視 なし
  });
  it('コア（防御力 0・倍率 9）に 37.5 → 337.5（無視は 0 より 下に しない）。倍率 0 の 部位（雲）→ 0', () => {
    expect(damageOf('core', 37.5, 10)).toBe(337.5);
    expect(damageOf('core', 37.5)).toBe(337.5);
    expect(damageOf('cloud', 37.5, 10)).toBe(0);
    expect(damageOf('cloud', 1000, 10)).toBe(0);
  });
  it('BigHit: 刀・波・雷・ドームの 当たり（blade・wave・strike・dome）には 無視が 効く: 手に 37.5 → 17.5', () => {
    for (const source of ['blade', 'wave', 'strike', 'dome']) {
      const bh = bigRig(() => 10);
      expect(bh.damage('hand', 37.5, null, source), source).toBe(17.5);
    }
  });
  it('手甲 なし（無視 0）は 強さ 25 の 刀で 手 → 1', () => {
    expect(bigRig(() => 0).damage('hand', 25, null, 'blade')).toBe(1);
    expect(bigRig().damage('hand', 25, null, 'blade')).toBe(1);
  });
  it('弓・パンチ（ray）の 当たりは 手甲でも 防御力 30 の まま: 手に 25 → 1、37.5 → 7.5', () => {
    expect(bigRig(() => 10).damage('hand', 25, null, 'ray')).toBe(1);
    expect(bigRig(() => 10).damage('hand', 37.5, null, 'ray')).toBe(7.5);
  });
  it('コアに 37.5 → 337.5（blade）。倍率 0 の 雲は 0', () => {
    expect(bigRig(() => 10).damage('core', 37.5, null, 'blade')).toBe(337.5);
    expect(bigRig(() => 10).damage('cloud', 37.5, null, 'blade')).toBe(0);
  });
  it('tekkoDefIgnore を 30 に する → 手に 37.5 → 37.5（防御力 30 が ぜんぶ 無視）', () => {
    const savedIgnore = NINJA_TUNING.tekkoDefIgnore;
    try {
      NINJA_TUNING.tekkoDefIgnore = 30;
      expect(bigRig(() => tekkoDefIgnoreOf(TEKKO)).damage('hand', 37.5, null, 'blade')).toBe(37.5);
    } finally {
      NINJA_TUNING.tekkoDefIgnore = savedIgnore;
    }
  });
  it('防御力の ひき算は damageOf の 1 か所: 部位の 防御力を 表で かえると damageOf も BigHit も したがう', () => {
    T.hit.partDef.hand = 12;
    expect(damageOf('hand', 20, 10)).toBe(18); // 20 − max(0, 12 − 10)
    expect(bigRig(() => 10).damage('hand', 20, null, 'blade')).toBe(18);
  });
});
