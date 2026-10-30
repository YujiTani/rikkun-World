import { describe, expect, it } from 'vitest';
import type { AnimalApi, BlockId, ItemId, ItemStack, LockStatus, PlayerState, Vec3 } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { actionHintLines } from '../ui/actionHintModel';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/** LIVE-1 §2.9 の 0・§2.8 の 9。A の 口 は 決まった 答え を 返す 仮 */
interface Opts {
  held: ItemId | null;
  count?: number;
  target?: BlockId | null;
  /** 仮 の rayHit の 距離（null = 当たらない） */
  hitDistance?: number | null;
  preview?: 'feed' | 'animalPet' | null;
  feed?: 'ate' | 'pet' | 'full' | null;
  hp?: number;
  eggHeal?: number;
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
  if (o.target !== null) blocks.set(key(5, 10, 6), o.target ?? 'stone');
  const player: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false, facingDeg: 0, running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const real = new InventoryImpl();
  // 'egg' は アイテム表（B）に まだ 無い間 は 仮物 の 持ち物 で 確かめる
  const fake: ItemStack | null = o.held === 'egg' ? { item: 'egg', count: o.count ?? 3 } : null;
  if (o.held && !fake) real.setSlot(0, { item: o.held, count: o.count ?? 3 });
  real.select(0);
  const inv = fake
    ? (Object.assign(Object.create(real), {
        held: () => fake,
        selected: () => 0,
        consumeHeld: () => ((fake.count -= 1), true),
      }) as InventoryImpl)
    : real;
  const log: string[] = [];
  const hit = o.hitDistance === undefined ? 1.5 : o.hitDistance;
  // LIVE-2 の 窓口 は このテスト では 使わない（C が 必要に なったら 足す）
  const animals: AnimalApi = {
    rayHit: (_origin: Vec3, _dir: Vec3, _max: number) => (hit === null ? null : { id: 7, distance: hit }),
    preview: (_id: number, _held: ItemStack | null) => (o.preview === undefined ? (_held && _held.item === 'tomato' ? 'feed' : 'animalPet') : o.preview),
    feed: (id: number, item: ItemId) => (log.push(`feed ${id} ${item}`), o.feed === undefined ? 'ate' : o.feed),
    pet: (id: number) => (log.push(`pet ${id}`), 'friend'),
    forEachVisible: () => {},
    swingNet: () => ({ caught: false, reason: 'miss' as const }),
    carryHold: () => null,
    putDown: () => false,
    carrying: () => null,
    ...({} as Omit<AnimalApi, 'rayHit' | 'preview' | 'isFriend' | 'emitHint' | 'feed' | 'pet' | 'isFull' | 'swingNet' | 'carryHold' | 'putDown' | 'carrying' | 'forEachVisible'>),
  };
  let hp = o.hp ?? 5;
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), () => 0, null, {
    animals,
    armor: { canEquip: (i) => i === 'kabuto', tryEquip: (i) => (log.push(`armor ${i}`), inv.consumeHeld(), true) },
    storage: {
      isTansu: (x, y, z) => world.getBlock(x, y, z) === 'tansu',
      open: (x, y, z) => (log.push(`tansu ${x},${y},${z}`), true),
      placed: () => {},
      broken: () => 0,
    },
    farm: {
      crop: () => null,
      soil: () => null,
      settings: () => ({}) as never,
      till: () => false,
      noteTillPress: () => {},
      plant: () => false,
      harvest: () => ({ ok: false, reason: 'none' }),
      onBlockBroken: () => [],
      grassSeed: () => null,
      eatHeal: (i) => (i === 'tomato' ? 2 : 0),
      noteEat: (i, h) => void log.push(`eat ${i} ${h}`),
      noteHint: (h) => void log.push(`hint ${h}`),
      ripen: () => false,
    },
    vitals: { hp: () => hp, maxHp: () => 10, heal: (n) => ((hp = Math.min(10, hp + n)), n) },
    ...(o.eggHeal !== undefined ? { eggHeal: () => o.eggHeal! } : {}),
  });
  dig.update();
  actions.endFrame();
  return { dig, actions, inv, log, world };
}

function press(r: ReturnType<typeof rig>): void {
  r.actions.press('secondary');
  r.dig.update();
  r.actions.release('secondary');
  r.actions.endFrame();
}

describe('右クリック 0: にわとり を ねらう', () => {
  it('やさい を 持つ → あげる（絵 は その やさい）。ate で 1 へる', () => {
    const r = rig({ held: 'tomato' });
    expect(r.dig.previewRightClick()).toEqual({ kind: 'feed', item: 'tomato' });
    expect(actionHintLines(r.dig.previewRightClick(), null, { held: 'tomato', heldIsPickaxe: false, heldIsBlade: false }).right).toEqual({ icon: 'tomato', word: 'あげる' });
    press(r);
    expect(r.log).toEqual(['feed 7 tomato']);
    expect(r.inv.held()?.count).toBe(2);
  });
  it('feed が pet（今日 もう たまご）・full・null なら やさい は へらない', () => {
    for (const f of ['pet', 'full', null] as const) {
      const r = rig({ held: 'tomato', feed: f });
      press(r);
      expect(r.inv.held()?.count, String(f)).toBe(3);
    }
  });
  it('preview が animalPet（今日 もう くれた なかま）→ やさい を 持っても 案内 は heart・なでる、実行 は pet', () => {
    const r = rig({ held: 'tomato', preview: 'animalPet' });
    const pv = r.dig.previewRightClick();
    expect(pv?.kind).toBe('animalPet');
    expect(actionHintLines(pv, null, { held: 'tomato', heldIsPickaxe: false, heldIsBlade: false }).right).toEqual({ icon: 'heart', word: 'なでる' });
    press(r);
    expect(r.log).toEqual(['pet 7']);
    expect(r.inv.held()?.count).toBe(3);
  });
  for (const held of [null, 'seed_tomato', 'egg', 'dirt', 'kabuto', 'bucket', 'watering_can'] as const)
    it(`${held ?? 'すで'} → なでる（防具 は きない・置かない・へらない）`, () => {
      const r = rig({ held, target: 'tansu', hitDistance: 1.0 });
      expect(r.dig.previewRightClick()?.kind).toBe('animalPet');
      const before = r.inv.held()?.count;
      press(r);
      expect(r.log).toEqual(['pet 7']);
      expect(r.inv.held()?.count).toBe(before);
    });
  it('ブロック の 手前 に いる → うしろ の たんす は ひらかない', () => {
    const r = rig({ held: 'dirt', target: 'tansu', hitDistance: 1.0 });
    press(r);
    expect(r.log.some((s) => s.startsWith('tansu'))).toBe(false);
  });
  it('にわとり が ブロック の むこう → 今まで どおり（たんす が ひらく）', () => {
    const r = rig({ held: 'dirt', target: 'tansu', hitDistance: 4 });
    expect(r.dig.previewRightClick()?.kind).toBe('storage');
    press(r);
    expect(r.log).toEqual(['tansu 5,10,6']);
  });
  it('当たらない → 今まで どおり', () => {
    const r = rig({ held: 'dirt', hitDistance: null });
    expect(r.dig.previewRightClick()?.kind).toBe('place');
  });
  it('preview が null（動き の とちゅう）→ 何も 起きない・ほか の 段 へ 進まない', () => {
    const r = rig({ held: 'dirt', preview: null, target: 'stone', hitDistance: 1 });
    expect(r.dig.previewRightClick()).toBeNull();
    press(r);
    expect(r.log).toEqual([]);
    expect(r.inv.held()?.count).toBe(3);
  });
  it('押しつづけ の ステップ では 0 を しない（1 回 だけ）・置かない', () => {
    const r = rig({ held: 'dirt', target: 'stone', hitDistance: 1 });
    r.actions.press('secondary');
    for (let i = 0; i < 90; i++) {
      r.dig.update();
      r.actions.endFrame();
    }
    r.actions.release('secondary');
    expect(r.log).toEqual(['pet 7']);
    expect(r.inv.held()?.count).toBe(3);
  });
  it('押しつづけ の 2 ステップ目 の 案内 は 出さない（previewRightClick(repeat)）', () => {
    const r = rig({ held: 'tomato' });
    expect(r.dig.previewRightClick(true)).toBeNull();
  });
});

describe('右クリック 9: たまご を たべる', () => {
  it('たまご で 体力 が へって いれば 1 こ たべて 2 もどる（eat:egg の 出来事）', () => {
    const r = rig({ held: 'egg', hp: 5, hitDistance: null });
    expect(r.dig.previewRightClick()).toEqual({ kind: 'eat', item: 'egg' });
    expect(actionHintLines(r.dig.previewRightClick(), null, { held: 'egg', heldIsPickaxe: false, heldIsBlade: false }).right).toEqual({ icon: 'egg', word: 'たべる' });
    press(r);
    expect(r.log).toEqual(['eat egg 2']);
    expect(r.inv.held()?.count).toBe(2);
  });
  it('たまご の 回復 は 設定（eggHeal）を すぐ 読む', () => {
    const r = rig({ held: 'egg', hp: 5, hitDistance: null, eggHeal: 4 });
    press(r);
    expect(r.log).toEqual(['eat egg 4']);
  });
  it('体力 まんたん → たべず 合図 full', () => {
    const r = rig({ held: 'egg', hp: 10, hitDistance: null });
    press(r);
    expect(r.log).toEqual(['hint full']);
    expect(r.inv.held()?.count).toBe(3);
  });
});
