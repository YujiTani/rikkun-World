/**
 * COOP-1 4d-2 のユニットテスト用の 共通の道具（テスト専用。ゲームの コードからは 読まない）。
 * 2P 用の わざの しくみ `createP2Legend`（src/duo/p2Legend.ts）を、three なし・ブロックの 世界で 1 ステップずつ 動かす。
 * 1P と くらべる ための「同じ 部品の 1P 版」`makeRef` も ここで 作る（`createLegendSystem` に 同じ 設定・同じ 入力を わたす）。
 * 実装への 約束（名前・形）は p2Legend.test.ts の 頭に 書いた。
 */
import type { ArmorSlot, ItemId, Vec3, W2Settings, YokaiInfo, YokaiWorld } from '../contracts';
import { createW2Settings } from '../contracts';
import { tekkoBladeMulOf } from '../craft/samuraiPower';
import { createLegendSystem, type LegendStepCtx } from '../legend/LegendSystem';
import { ArrayVoxelWorld } from '../world/VoxelWorld';

export const FLOOR = 8;
export const POS: Vec3 = { x: 20.5, y: FLOOR + 1, z: 20.5 };
const EYE: Vec3 = { x: 20.5, y: FLOOR + 1 + 1.4, z: 20.5 };
/** 北（−z）の 8 マス先の 地面（雷の ねらい） */
export const GROUND8: Vec3 = { x: 20.5, y: FLOOR + 1, z: 12.5 };

export const S: W2Settings = createW2Settings();

/** 設定の 表から 引く（id を 直書きしない）: ためわざの しゅるいで その 武器 */
export const itemByCharge = (kind: 'lightning' | 'spiral' | 'shining'): ItemId => S.legendary.find((d) => d.charge?.kind === kind)!.item;
export const chargeTicksOf = (item: ItemId): number => S.legendary.find((d) => d.item === item)!.charge!.chargeTicks;
export const CHARGE_KINDS = ['lightning', 'spiral', 'shining'] as const;

export const dirTo = (to: Vec3, from: Vec3 = EYE): Vec3 => {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const l = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / l, y: d.y / l, z: d.z / l };
};

export function karakasa(id: number, at: Vec3, hp = 999): YokaiInfo {
  return { id, kind: 'karakasa', position: { ...at }, yawDeg: 0, hp, maxHp: hp, state: 'idle', attackTick: 0, scale: 1, name: 'x', title: 'none', m: 1, attack: 2 } as YokaiInfo;
}

export interface DamageCall {
  id: number;
  amount: number;
  /** 6 番目の 引数（だれが 当てたか。1P は 渡さない → undefined） */
  who: unknown;
  /** 引数の 数 */
  argc: number;
}

/** 妖怪の 世界の にせもの（damage の 呼ばれ方を 全部 きろくする） */
export function fakeYokai(list: YokaiInfo[]) {
  const calls: DamageCall[] = [];
  const world = {
    list: () => list,
    raycast: () => null,
    occupies: () => false,
    drainEvents: () => [],
    pull: () => {},
    damage: (...a: unknown[]) => {
      calls.push({ id: a[0] as number, amount: a[1] as number, who: a[5], argc: a.length });
      return a[1] as number;
    },
  } as unknown as YokaiWorld;
  return { world, calls };
}

export const baseCtx = (item: ItemId, power: number | null = 10): LegendStepCtx => ({
  item,
  power,
  active: true,
  pressed: false,
  held: false,
  startOk: true,
  bladeBusy: false,
  bladeAccepts: false,
  bladeChainOpen: false,
  eye: EYE,
  dir: dirTo(GROUND8),
  position: POS,
  yawDeg: 0,
  inWater: false,
  onGround: true,
});

export function makeWorld(): ArrayVoxelWorld {
  const world = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
  for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) world.setBlock(x, FLOOR, z, 'stone');
  return world;
}

export const wearing = (arms: ItemId | null) => ({ equipped: (slot: ArmorSlot): ItemId | null => (slot === 'arms' ? arms : null) });
export const TEKKO_ID = 'samurai_tekko' as ItemId;

export interface CamSpy {
  calls: Array<number | null>;
  setDistance(d: number | null): void;
}
export const camSpy = (): CamSpy => {
  const s: CamSpy = {
    calls: [],
    setDistance: (d) => {
      s.calls.push(d);
    },
  };
  return s;
};

/** 1P の 部品（createLegendSystem）。2P と 同じ 設定・同じ 入力で くらべる ための もの */
export function makeRef(o: { item: ItemId; list?: YokaiInfo[]; arms?: ItemId | null; power?: number | null; base?: () => number }) {
  const world = makeWorld();
  const y = fakeYokai(o.list ?? []);
  const wears: number[] = [];
  let tick = 0;
  const armor = wearing(o.arms ?? null);
  const sys = createLegendSystem({
    world,
    yokai: () => y.world,
    settings: S,
    tick: () => tick,
    onWear: () => wears.push(1),
    powerMul: (item) => tekkoBladeMulOf(armor, item),
    seed: 1,
    ...(o.base ? { baseDistance: o.base } : {}),
  });
  const step = (c: Partial<LegendStepCtx> = {}) => {
    tick += 1;
    return sys.step({ ...baseCtx(o.item, o.power ?? 10), ...c });
  };
  return { sys, y, wears, step };
}

/**
 * ためて はなす: 押して（ためF 1）chargeTicks まで ため、はなす（その ステップが わざの F1）。
 * hold 後に after ステップ 進める。step は makeP2().step か makeRef().step。
 * 戻りは 各ステップの 後で呼ぶ cb（あれば）。
 */
export function chargeAndRelease(step: (c?: Partial<LegendStepCtx>) => unknown, ticks: number, after: number, cb?: (i: number) => void): void {
  let i = 0;
  step({ pressed: true, held: true });
  cb?.(i++);
  for (let n = 1; n < ticks; n++) {
    step({ held: true });
    cb?.(i++);
  }
  step({ held: false });
  cb?.(i++);
  for (let n = 0; n < after; n++) {
    step({});
    cb?.(i++);
  }
}
