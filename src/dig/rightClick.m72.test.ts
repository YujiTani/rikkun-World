import { describe, expect, it } from 'vitest';
import type { BlockId, FarmCropInfo, FarmEvent, ItemId, ItemStack, LockStatus, PetResult, PlayerState, Vec3, WaterRay } from '../contracts';
import { createM7Settings } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { actionHintLines } from '../ui/actionHintModel';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import { computeWaterRay, createWaterRay } from './rightClick';

const CROP: FarmCropInfo = { kind: 'tomato', stage: 1, stageTicks: 0, wet: false, lit: true, ripe: false };

interface Opts {
  held: ItemId | null;
  water?: number;
  target?: BlockId | null;
  /** 目 と 的 の あいだ の みず の マス（x=4） */
  river?: boolean;
  pitch?: number;
  petAnswer?: PetResult | null;
}

function rig(o: Opts) {
  const blocks = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const world = {
    size: { x: 64, y: 32, z: 64 },
    getBlock: (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64 ? 'outside' : (blocks.get(key(x, y, z)) ?? 'air')),
    setBlock: (x: number, y: number, z: number, id: BlockId) => (blocks.set(key(x, y, z), id), true),
    isSolid: (x: number, y: number, z: number) => {
      const b = blocks.get(key(x, y, z));
      return !!b && b !== 'air' && b !== 'water';
    },
  };
  for (let x = 0; x <= 12; x++) for (let z = 0; z <= 12; z++) blocks.set(key(x, 8, z), 'stone');
  if (o.target !== null) blocks.set(key(5, 10, 6), o.target ?? 'crop_tomato');
  if (o.river) blocks.set(key(4, 10, 6), 'water');
  const player: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: o.pitch ?? 0,
    onGround: true,
    inWater: false,
    moving: false, facingDeg: 0, running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  // じょうろ は items.ts に まだ 無い（B）ので、持ち物 の 仮物 を 使う
  const canStack: ItemStack | null = o.held === 'watering_can' || o.held === 'long_watering_can' ? { item: o.held, count: 1, water: o.water } : null;
  const real = new InventoryImpl();
  if (o.held && !canStack) real.setSlot(0, { item: o.held, count: 2 });
  real.select(0);
  const inv = canStack
    ? (Object.assign(Object.create(real), {
        held: () => canStack,
        selected: () => 0,
        consumeHeld: () => false,
      }) as InventoryImpl)
    : real;
  const log: string[] = [];
  const events: FarmEvent[] = [];
  const hints: string[] = [];
  const isCan = (i?: ItemId) => i === 'watering_can' || i === 'long_watering_can';
  // 仮の WateringPort（決まった 答え）
  const water = {
    canPreview: (held: ItemStack | null, ray: WaterRay, repeat: boolean) => {
      if (!held || !isCan(held.item)) return null;
      if (ray.throughWater) return repeat ? null : 'fill';
      if ((held.water ?? 0) > 0) return ray.hit ? 'pour' : null;
      return repeat ? null : 'fillHint';
    },
    fill: (slot: number, at: Vec3) => (log.push(`fill ${slot} ${at.x},${at.y},${at.z}`), 10),
    pour: (slot: number, t: Vec3, f: { dx: number; dz: number }) => (log.push(`pour ${slot} ${t.x},${t.y},${t.z} ${Math.round(f.dx)},${Math.round(f.dz) + 0}`), 1),
  };
  const pet = {
    growFactor: () => 1.1,
    isHappy: () => false,
    left: () => 0,
    pet: (x: number, y: number, z: number, c: FarmCropInfo & { wild: boolean }) => {
      log.push(`pet ${x},${y},${z}${c.wild ? ' wild' : ''}`);
      return o.petAnswer === undefined ? (c.wild ? 'wild' : 'happy') : o.petAnswer;
    },
    tick: () => {},
    onCropRemoved: () => {},
    serialize: () => [],
    deserialize: () => {},
  };
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), () => 0, null, {
    armor: { canEquip: (i) => i === 'kabuto', tryEquip: (i) => (log.push(`armor ${i}`), inv.consumeHeld(), true) },
    farm: {
      crop: (x, y, z) => (world.getBlock(x, y, z).includes('tomato') ? CROP : null),
      soil: () => null,
      settings: () => createM7Settings(),
      till: () => false,
      noteTillPress: () => {},
      plant: () => false,
      harvest: () => ({ ok: false, reason: 'none' }),
      onBlockBroken: () => [],
      grassSeed: () => null,
      eatHeal: () => 2,
      noteEat: () => log.push('eat'),
      noteHint: (h) => hints.push(h),
    },
    vitals: { hp: () => 5, maxHp: () => 10, heal: () => 2 },
    water,
    pet,
    emitFarm: (e) => events.push(e),
  });
  dig.update();
  actions.endFrame();
  return { dig, actions, inv, log, events, hints, world };
}

function press(r: ReturnType<typeof rig>): void {
  r.actions.press('secondary');
  r.dig.update();
  r.actions.release('secondary');
  r.actions.endFrame();
}

describe('右クリックの 10 だん（AC14）', () => {
  const helds: (ItemId | null)[] = [null, 'seed_tomato', 'tomato', 'dirt', 'katana', 'yumi', 'kuwa', 'torch'];
  for (const held of helds)
    it(`${held ?? 'すで'} で 作物 を ねらう → なでる（たべない・おかない・へらない）`, () => {
      const r = rig({ held });
      expect(r.dig.previewRightClick()).toEqual({ kind: 'pet', item: 'tomato' });
      const before = r.inv.held()?.count;
      press(r);
      expect(r.log).toEqual(['pet 5,10,6']);
      expect(r.inv.held()?.count).toBe(before);
      expect(r.world.getBlock(4, 10, 6)).toBe('air');
      expect(r.events).toEqual([expect.objectContaining({ type: 'pet', result: 'happy', x: 5, y: 10, z: 6 })]);
    });
  it('防具 は きる（なでない）', () => {
    const r = rig({ held: 'kabuto' });
    expect(r.dig.previewRightClick()?.kind).toBe('armor');
    press(r);
    expect(r.log).toEqual(['armor kabuto']);
  });
  it('みず の 入った じょうろ なら まく（なでない）', () => {
    const r = rig({ held: 'watering_can', water: 5 });
    expect(r.dig.previewRightClick()?.kind).toBe('pour');
    press(r);
    expect(r.log).toEqual(['pour 0 5,10,6 1,0']);
  });
  it('やせいの やさい は wild で 出来事 1 つ', () => {
    const r = rig({ held: null, target: 'wild_tomato' });
    press(r);
    expect(r.log).toEqual(['pet 5,10,6 wild']);
    expect(r.events[0]).toMatchObject({ type: 'pet', result: 'wild' });
  });
  it('作物 を ねらって いない とき は やさい を たべる（M7 AC19）', () => {
    const r = rig({ held: 'tomato', target: 'stone' });
    expect(r.dig.previewRightClick()?.kind).toBe('eat');
  });
  it('押しつづけて 120 ステップ でも なでる のは 1 回', () => {
    const r = rig({ held: null });
    r.actions.press('secondary');
    for (let i = 0; i < 120; i++) {
      r.dig.update();
      r.actions.endFrame();
    }
    expect(r.log).toEqual(['pet 5,10,6']);
  });
  it('なでられない（pet が null）と 出来事 なし', () => {
    const r = rig({ held: null, petAnswer: null });
    press(r);
    expect(r.events).toEqual([]);
  });
});

describe('じょうろ 4a〜4c（AC1・AC4・AC5・AC18 の ふりわけ）', () => {
  it('みず を 通る 線 は くむ（みず が あっても）。いちばん 手前 の みず の マス を わたす', () => {
    const r = rig({ held: 'watering_can', water: 5, river: true });
    expect(r.dig.previewRightClick()?.kind).toBe('fill');
    press(r);
    expect(r.log).toEqual(['fill 0 4,10,6']);
  });
  it('からっぽ で みず を ねらわない → 合図 fill（ねらい は 何でも・無くても）', () => {
    for (const target of ['stone', 'grass', null] as const) {
      const r = rig({ held: 'watering_can', water: 0, target });
      expect(r.dig.previewRightClick()?.kind).toBe('fillHint');
      press(r);
      expect(r.hints).toEqual(['fill']);
      expect(r.log).toEqual([]);
    }
  });
  it('おしつづけ: 0・30・60 ステップ で まく。とちゅう で 線 が みず を 通ると 何も しない', () => {
    const r = rig({ held: 'watering_can', water: 10 });
    r.actions.press('secondary');
    for (let i = 0; i < 61; i++) {
      if (i === 30) r.world.setBlock(4, 10, 6, 'water');
      if (i === 31) r.world.setBlock(4, 10, 6, 'air');
      r.dig.update();
      r.actions.endFrame();
    }
    expect(r.log.filter((l) => l.startsWith('pour')).length).toBe(2);
    expect(r.log.some((l) => l.startsWith('fill'))).toBe(false);
  });
  it('ねらい が 無い みず入り じょうろ は 何も しない', () => {
    const r = rig({ held: 'watering_can', water: 3, target: null });
    expect(r.dig.previewRightClick()).toBeNull();
    press(r);
    expect(r.log).toEqual([]);
  });
});

describe('照準の下の 案内（AC18）', () => {
  const lines = (o: Opts) => {
    const r = rig(o);
    return actionHintLines(r.dig.previewRightClick(), r.dig.previewLeftClick(), { held: o.held, heldIsPickaxe: false, heldIsBlade: false }).right;
  };
  it('くむ・みずやり・くもう・なでる', () => {
    expect(lines({ held: 'watering_can', water: 3, river: true })).toEqual({ icon: 'watering_can', word: 'くむ' });
    expect(lines({ held: 'long_watering_can', water: 3, river: true })).toEqual({ icon: 'long_watering_can', word: 'くむ' });
    expect(lines({ held: 'watering_can', water: 3 })).toEqual({ icon: 'watering_can', word: 'みずやり' });
    expect(lines({ held: 'long_watering_can', water: 0 })).toEqual({ icon: 'long_watering_can', word: 'くもう' });
    expect(lines({ held: null })).toEqual({ icon: 'tomato', word: 'なでる' });
  });
});

describe('みず の 線（computeWaterRay）', () => {
  const mk = (cells: Array<[number, number, number, BlockId]>) => {
    const m = new Map(cells.map(([x, y, z, id]) => [`${x},${y},${z}`, id]));
    return (x: number, y: number, z: number): BlockId | 'outside' => m.get(`${x},${y},${z}`) ?? 'air';
  };
  it('目 の マス の みず は 数えない・5 マス 先 まで・かたい ブロック の むこう は 数えない', () => {
    const out = createWaterRay();
    expect(computeWaterRay(mk([[0, 0, 0, 'water']]), 0.5, 0.5, 0.5, 1, 0, 0, 5, null, out).throughWater).toBe(false);
    expect(computeWaterRay(mk([[4, 0, 0, 'water']]), 0.5, 0.5, 0.5, 1, 0, 0, 5, null, out).throughWater).toBe(true);
    expect(out.waterCell).toEqual({ x: 4, y: 0, z: 0 });
    expect(computeWaterRay(mk([[6, 0, 0, 'water']]), 0.5, 0.5, 0.5, 1, 0, 0, 5, null, out).throughWater).toBe(false);
    const hit = { block: { x: 2, y: 0, z: 0 }, id: 'stone' as BlockId, face: { x: -1, y: 0, z: 0 }, place: { x: 1, y: 0, z: 0 }, distance: 1.5 };
    expect(computeWaterRay(mk([[2, 0, 0, 'stone'], [3, 0, 0, 'water']]), 0.5, 0.5, 0.5, 1, 0, 0, 5, hit, out).throughWater).toBe(false);
    expect(computeWaterRay(mk([[1, 0, 0, 'water'], [2, 0, 0, 'stone']]), 0.5, 0.5, 0.5, 1, 0, 0, 5, hit, out).throughWater).toBe(true);
  });
});
