import { describe, expect, it } from 'vitest';
import type { BlockId, FarmCropInfo, FarmEvent, ItemId, LockStatus, PlayerState } from '../contracts';
import { createM7Settings } from '../contracts';
import { createBucket } from '../farm/bucket';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { actionHintLines } from '../ui/actionHintModel';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/** 水の 判定・id（WATER-1 §4.6）。`water.ts` の まえでも 他の テストを 落とさないよう ここに 書く */
const waterAmount = (id: string): number => (id === 'water' ? 8 : /^water_[1-7]$/.test(id) ? Number(id.slice(6)) : 0);
const isWater = (id: string): boolean => waterAmount(id) > 0;
const waterId = (n: number): BlockId => (n === 8 ? 'water' : (`water_${n}` as BlockId));

const CROP: FarmCropInfo = { kind: 'tomato', stage: 1, stageTicks: 0, wet: false, lit: true, ripe: false };

interface Opts {
  held: ItemId | null;
  /** みずの バケツの 量（WATER-1。なし = 欄 なし = 8） */
  heldWater?: number;
  target?: BlockId | null;
  /** 水の マス（4,10,6）。true = 量 8、数 = その 量（WATER-1） */
  river?: boolean | number;
  pitch?: number;
  body?: boolean;
  blocked?: boolean;
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
      return !!b && b !== 'air' && !isWater(b);
    },
  };
  for (let x = 0; x <= 12; x++) for (let z = 0; z <= 12; z++) blocks.set(key(x, 8, z), 'stone');
  if (o.target !== null) blocks.set(key(5, 10, 6), o.target ?? 'stone');
  if (o.river) blocks.set(key(4, 10, 6), o.river === true ? 'water' : waterId(o.river));
  const player: PlayerState = {
    position: o.body ? { x: 4.5, y: 9, z: 6.5 } : { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: o.pitch ?? 0,
    onGround: true,
    inWater: false,
    moving: false, facingDeg: 0, running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  if (o.held) inv.setSlot(0, { item: o.held, count: 1, ...(o.heldWater === undefined ? {} : { water: o.heldWater }) });
  inv.select(0);
  const events: FarmEvent[] = [];
  const hints: string[] = [];
  const log: string[] = [];
  const bucket = createBucket({ inventory: inv, emit: (e) => void events.push(e), tick: () => 0, world: world as never });
  const gate = { blocksInput: () => false, primaryStep: () => false, placeBlocked: () => !!o.blocked, aimedYokai: () => null };
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), () => 0, gate, {
    craft: { isFurnace: (x, y, z) => world.getBlock(x, y, z) === 'furnace', openFurnace: () => void log.push('furnace'), furnaceBroken: () => {}, fixedDrop: () => null },
    storage: { isTansu: (x, y, z) => world.getBlock(x, y, z) === 'tansu', open: () => (log.push('tansu'), true), placed: () => {}, broken: () => 0 },
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
      noteEat: () => {},
      noteHint: (h) => hints.push(h),
      ripen: () => false,
    },
    bucket,
    pet: { growFactor: () => 1, isHappy: () => false, left: () => 0, pet: () => (log.push('pet'), 'happy'), tick: () => {}, onCropRemoved: () => {}, serialize: () => [], deserialize: () => {} },
    emitFarm: (e) => events.push(e),
    vitals: { hp: () => 5, maxHp: () => 10, heal: () => 2 },
  });
  dig.update();
  actions.endFrame();
  return { dig, actions, inv, events, hints, world, log };
}

function press(r: ReturnType<typeof rig>): void {
  r.actions.press('secondary');
  r.dig.update();
  r.actions.release('secondary');
  r.actions.endFrame();
}

describe('BUCKET-1 右クリックの ふりわけ（AC4・5・7・8）', () => {
  it('4d くむ: から → みず（量 8）。WATER-1: 水の マスは air に へる', () => {
    const r = rig({ held: 'bucket', target: null, river: true });
    expect(r.dig.previewRightClick()).toEqual({ kind: 'bucketFill', item: 'bucket' });
    press(r);
    expect(r.inv.held()).toMatchObject({ item: 'water_bucket', count: 1, water: 8 });
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    expect(r.events).toEqual([expect.objectContaining({ type: 'bucketFill', x: 4, y: 10, z: 6, changed: true })]);
  });
  it('4d WATER-1: 量 3 の マスを くむ → バケツは 量 3・マスは air', () => {
    const r = rig({ held: 'bucket', target: null, river: 3 });
    press(r);
    expect(r.inv.held()).toMatchObject({ item: 'water_bucket', water: 3 });
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
  });
  it('4d WATER-1: 量 5 の バケツで 量 8 の マス → バケツ 8・マス 量 5', () => {
    const r = rig({ held: 'water_bucket', heldWater: 5, target: null, river: true });
    press(r);
    expect(r.inv.held()).toMatchObject({ item: 'water_bucket', water: 8 });
    expect(waterAmount(r.world.getBlock(4, 10, 6))).toBe(5);
    expect(r.events).toEqual([expect.objectContaining({ type: 'bucketFill', changed: true })]);
  });
  it('4d みずの バケツ（量 8）で くんでも かわらない（4e より 先）。マスも へらない', () => {
    const r = rig({ held: 'water_bucket', river: true });
    expect(r.dig.previewRightClick()?.kind).toBe('bucketFill');
    expect(r.dig.bucketSpot()).toBeNull();
    press(r);
    expect(r.inv.held()?.item).toBe('water_bucket');
    expect(r.world.getBlock(4, 10, 6)).toBe('water');
    expect(r.events).toEqual([expect.objectContaining({ type: 'bucketFill', changed: false })]);
  });
  it('4e おく: ねらった面の 手前に water（量 8）・から に もどる', () => {
    const r = rig({ held: 'water_bucket' });
    expect(r.dig.bucketSpot()).toEqual({ x: 4, y: 10, z: 6 });
    expect(r.dig.previewRightClick()?.kind).toBe('bucketPlace');
    press(r);
    expect(r.world.getBlock(4, 10, 6)).toBe('water');
    expect(r.inv.held()).toEqual({ item: 'bucket', count: 1 });
    expect(r.events).toEqual([expect.objectContaining({ type: 'bucketPlace', x: 4, y: 10, z: 6 })]);
  });
  it('4e WATER-1: 量 3 の みずの バケツを おく → water_3・から に もどる（量の 欄は のこらない）', () => {
    const r = rig({ held: 'water_bucket', heldWater: 3 });
    press(r);
    expect(r.world.getBlock(4, 10, 6)).toBe('water_3');
    expect(r.inv.held()).toEqual({ item: 'bucket', count: 1 });
    expect(r.inv.held()?.water).toBeUndefined();
  });
  it('4e WATER-1: 量 1〜8 の どれでも その 量の 水が できる', () => {
    for (let a = 1; a <= 8; a++) {
      const r = rig({ held: 'water_bucket', heldWater: a });
      press(r);
      expect(waterAmount(r.world.getBlock(4, 10, 6)), `量 ${a}`).toBe(a);
    }
  });
  it('4f から で 水で ない 所 → 合図 bucket（ブロックを おかない）', () => {
    const r = rig({ held: 'bucket' });
    expect(r.dig.previewRightClick()?.kind).toBe('bucketHint');
    press(r);
    expect(r.hints).toEqual(['bucket']);
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    expect(r.inv.held()?.item).toBe('bucket');
  });
  it('4f ねらいが 無くても 合図', () => {
    const r = rig({ held: 'bucket', target: null, pitch: 80 });
    press(r);
    expect(r.hints).toEqual(['bucket']);
  });
  it('4g 置けない: 体と かさなる・妖怪の箱・作物 → コン（bucketNo）、水は ふえない', () => {
    for (const o of [{ body: true }, { blocked: true }, { target: 'crop_tomato' as BlockId }]) {
      const r = rig({ held: 'water_bucket', ...o });
      expect(r.dig.bucketSpot(), JSON.stringify(o)).toBeNull();
      expect(r.dig.previewRightClick()?.kind).toBe('bucketNo');
      press(r);
      expect(r.events.map((e) => e.type)).toEqual(['bucketNo']);
      expect(isWater(r.world.getBlock(4, 10, 6)), '水は ふえない').toBe(false);
      expect(r.inv.held()?.item).toBe('water_bucket');
    }
  });
  it('4g 空 → 何も しない（preview null）', () => {
    const r = rig({ held: 'water_bucket', target: null, pitch: 80 });
    expect(r.dig.bucketSpot()).toBeNull();
    expect(r.dig.previewRightClick()).toBeNull();
    press(r);
    expect(r.events).toEqual([]);
  });
  it('作物を ねらっても なでない・ブロックの 段に 進まない', () => {
    for (const held of ['bucket', 'water_bucket'] as const) {
      const r = rig({ held, target: 'crop_tomato' });
      press(r);
      expect(r.log).not.toContain('pet');
      expect(r.events.some((e) => e.type === 'pet')).toBe(false);
    }
  });
  it('たんす・かまど は 先に ひらく', () => {
    for (const [t, k] of [['tansu', 'storage'], ['furnace', 'furnace']] as const) {
      const r = rig({ held: 'water_bucket', target: t });
      expect(r.dig.previewRightClick()?.kind).toBe(k);
    }
  });
  it('押しつづけ（2 ステップ目以降）は 何も しない', () => {
    const r = rig({ held: 'bucket', target: null, river: true });
    r.actions.press('secondary');
    for (let i = 0; i < 200; i++) {
      r.dig.update();
      r.actions.endFrame();
    }
    r.actions.release('secondary');
    expect(r.events.filter((e) => e.type === 'bucketFill')).toHaveLength(1);
    expect(r.inv.held()?.item).toBe('water_bucket');
    expect(r.world.getBlock(4, 10, 6), 'WATER-1: 1 回 くんだ ので マスは air（押しつづけても もう くまない）').toBe('air');
  });
  it('照準の下: くむ・おく・くもう の 絵は 持っている バケツ。4g は 出ない', () => {
    const line = (o: Opts) => {
      const r = rig(o);
      return actionHintLines(r.dig.previewRightClick(), null, { held: o.held, heldIsPickaxe: false, heldIsBlade: false }).right;
    };
    expect(line({ held: 'bucket', target: null, river: true })).toEqual({ icon: 'bucket', word: 'くむ' });
    expect(line({ held: 'water_bucket' })).toEqual({ icon: 'water_bucket', word: 'おく' });
    expect(line({ held: 'bucket' })).toEqual({ icon: 'bucket', word: 'くもう' });
    expect(line({ held: 'water_bucket', target: 'crop_tomato' })).toBeUndefined();
  });
  it('preview と 実際が 同じ', () => {
    for (const held of ['bucket', 'water_bucket'] as const)
      for (const o of [{}, { river: true }, { body: true }, { target: 'crop_tomato' as BlockId }, { target: null, pitch: 80 }]) {
        const kind = rig({ held, ...o }).dig.previewRightClick()?.kind ?? 'none';
        const r = rig({ held, ...o });
        press(r);
        const did = r.events.map((e) => e.type)[0] ?? (r.hints.length ? 'bucketHint' : 'none');
        expect(did, `${held} ${JSON.stringify(o)}`).toBe(kind === 'bucketFill' || kind === 'bucketPlace' || kind === 'bucketNo' || kind === 'bucketHint' ? kind : 'none');
      }
  });
});
