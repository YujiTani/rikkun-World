import { describe, expect, it } from 'vitest';
import type { AnimalApi, AnimalHintKind, BlockId, CoopInfo, ItemId, KitInfo, LockStatus, PlayerState, TargetInfo } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { actionHintLines } from '../ui/actionHintModel';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import { previewRightClick, type RightClickCtx } from './rightClick';

/**
 * LIVE-2 §2.11 のふりわけ（1a こたつ・1b 小屋・10a toriya）、§2.3 の こわせない しらせ、ねている 子。
 * A の AnimalApi は にせもの（答えを決めて、呼ばれたことを log に残す）。
 */

const target = (id: BlockId): TargetInfo =>
  ({ block: { x: 5, y: 10, z: 6 }, place: { x: 4, y: 10, z: 6 }, id, distance: 2, normal: { x: -1, y: 0, z: 0 } }) as unknown as TargetInfo;

function ctx(o: Partial<RightClickCtx> & { held: ItemId | null; id?: BlockId }): RightClickCtx {
  return {
    target: target(o.id ?? 'stone'),
    isTansu: () => false,
    isFurnace: () => false,
    canEquip: () => false,
    canPlace: () => o.held === 'dirt',
    isVeg: (i) => i === 'tomato' || i === 'egg',
    ...o,
  };
}
const kind = (c: RightClickCtx) => previewRightClick(c)?.kind ?? null;

describe('previewRightClick（LIVE-2 1a・1b・10a）', () => {
  it('1a: から の こたつ ＋ egg／kin_tamago → kitPut（持っている もの の 絵）', () => {
    for (const held of ['egg', 'kin_tamago'] as ItemId[]) {
      const p = previewRightClick(ctx({ held, id: 'nukunuku', kit: () => ({ occupied: false }) }));
      expect(p).toEqual({ kind: 'kitPut', item: held });
    }
  });
  it('1a: 入って いる → まってね（egg を 持って いても）。から ＋ すで／トマト → kitNeedEgg（たべない）', () => {
    expect(kind(ctx({ held: 'egg', id: 'nukunuku', kit: () => ({ occupied: true }) }))).toBe('kitWait');
    expect(kind(ctx({ held: null, id: 'nukunuku', kit: () => ({ occupied: true }) }))).toBe('kitWait');
    expect(kind(ctx({ held: null, id: 'nukunuku', kit: () => ({ occupied: false }) }))).toBe('kitNeedEgg');
    expect(kind(ctx({ held: 'tomato', id: 'nukunuku', kit: () => ({ occupied: false }) }))).toBe('kitNeedEgg');
  });
  it('1a: 置ける 物（つち）と toriya は こたつ の うえ でも 10 へ（置く）', () => {
    expect(kind(ctx({ held: 'dirt', id: 'nukunuku', kit: () => ({ occupied: false }) }))).toBe('place');
    expect(kind(ctx({ held: 'dirt', id: 'nukunuku', kit: () => ({ occupied: true }) }))).toBe('place');
    expect(kind(ctx({ held: 'toriya', id: 'nukunuku', kit: () => ({ occupied: true }), coopSpot: () => 'ok' }))).toBe('coopPlace');
  });
  it('1a: こたつ で ない ブロック は 今まで どおり（egg は たべる）', () => {
    expect(kind(ctx({ held: 'egg', id: 'stone' }))).toBe('eat');
  });
  it('1b: すばこ に 1 こ 以上 → coopCollect（つち を 持って いても）', () => {
    expect(kind(ctx({ held: 'dirt', id: 'toriya_fence', coop: () => ({ eggs: 1 }) }))).toBe('coopCollect');
    expect(kind(ctx({ held: 'tomato', id: 'toriya_box', coop: () => ({ eggs: 3 }) }))).toBe('coopCollect');
  });
  it('1b: 0 こ → 置ける 物 は 置く、ほか は coopNoEgg（たべない）', () => {
    expect(kind(ctx({ held: 'dirt', id: 'toriya_fence', coop: () => ({ eggs: 0 }) }))).toBe('place');
    expect(kind(ctx({ held: null, id: 'toriya_gate', coop: () => ({ eggs: 0 }) }))).toBe('coopNoEgg');
    expect(kind(ctx({ held: 'egg', id: 'toriya_nest', coop: () => ({ eggs: 0 }) }))).toBe('coopNoEgg');
  });
  it('10a: toriya ＋ ねらい → 入る=coopPlace／入らない=coopNoRoom／3 つ=coopMax。ねらい なし は null', () => {
    expect(kind(ctx({ held: 'toriya', coopSpot: () => 'ok' }))).toBe('coopPlace');
    expect(kind(ctx({ held: 'toriya', coopSpot: () => 'noRoom' }))).toBe('coopNoRoom');
    expect(kind(ctx({ held: 'toriya', coopSpot: () => 'max' }))).toBe('coopMax');
    expect(previewRightClick({ ...ctx({ held: 'toriya', coopSpot: () => 'ok' }), target: null })).toBeNull();
  });
  it('10a の まえ に たんす・にわとり・だっこ が 先（00・0 は LIVE-1 の まま）', () => {
    expect(kind(ctx({ held: 'toriya', coopSpot: () => 'ok', carrying: () => true }))).toBe('putDown');
    expect(kind(ctx({ held: 'toriya', coopSpot: () => 'ok', animal: () => 'animalPet' }))).toBe('animalPet');
    expect(kind(ctx({ held: 'toriya', coopSpot: () => 'ok', isTansu: () => true }))).toBe('storage');
  });
});

describe('照準 の 下 の 案内（LIVE-2）', () => {
  const L = { held: null, heldIsPickaxe: false, heldIsBlade: false };
  it('previewRightClick の 答え → 絵 と 語', () => {
    const h = (c: RightClickCtx) => actionHintLines(previewRightClick(c), null, L).right;
    expect(h(ctx({ held: 'egg', id: 'nukunuku', kit: () => ({ occupied: false }) }))).toEqual({ icon: 'egg', word: 'いれる' });
    expect(h(ctx({ held: null, id: 'nukunuku', kit: () => ({ occupied: true }) }))).toMatchObject({ word: 'まってね' });
    expect(h(ctx({ held: 'mushi', id: 'toriya_box', coop: () => ({ eggs: 2 }) }))).toMatchObject({ word: 'あつめる' });
    expect(h(ctx({ held: 'toriya', coopSpot: () => 'ok' }))).toEqual({ icon: 'toriya', word: 'おく' });
    expect(h(ctx({ held: 'toriya', coopSpot: () => 'noRoom' }))).toEqual({ icon: 'toriya', word: 'おく', disabled: true });
  });
});

// ---------------------------------------------------------------- DigSystem（にせの A）

interface Opts {
  held: ItemId | null;
  count?: number;
  /** ねらう ブロック（5,10,6） */
  target: BlockId;
  /** こたつ に たまご が 入って いる か */
  kitEgg?: boolean;
  /** useKit の 答え（なければ 持ち物 から 決める） */
  useKit?: 'put' | 'wait' | 'needEgg' | 'max';
  coop?: { nest: { egg: number; gold: number }; kids: number[] } | null;
  placeResult?: number | 'noRoom' | 'max';
  previewOk?: boolean;
  coopsCount?: number;
  feed?: 'ate' | 'full' | 'pet' | 'friendFull' | 'sleep' | null;
  hitAnimal?: boolean;
  carrying?: boolean;
  putDown?: boolean;
  putDownWhy?: 'coopFull' | 'friendFull' | null;
  locked?: boolean;
  collected?: { egg: number; gold: number };
  removeOk?: boolean;
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
  blocks.set(key(5, 10, 6), o.target);
  const player: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false,
    facingDeg: 0,
    running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const real = new InventoryImpl();
  // 'mushi'・'toriya'・'kin_tamago' など 新しい もの は アイテム表（B）に まだ 無い 間 は 仮物 の 持ち物
  const fake = o.held ? { item: o.held, count: o.count ?? 3 } : null;
  real.select(0);
  const added: Array<[ItemId, number]> = [];
  const inv = Object.assign(Object.create(real), {
    held: () => (fake && fake.count > 0 ? fake : null),
    selected: () => 0,
    consumeHeld: () => {
      if (fake) fake.count -= 1;
      return true;
    },
    add: (item: ItemId, n: number) => (added.push([item, n]), 0),
  }) as InventoryImpl;
  const log: string[] = [];
  const hints: AnimalHintKind[] = [];
  const events: Array<{ type: string; id?: string }> = [];
  const picked: Array<[ItemId, number]> = [];
  const coopInfo: CoopInfo | null = o.coop
    ? { id: 3, x: 5, y: 10, z: 6, dir: 0, gate: { x: 5, z: 8 }, kids: o.coop.kids, nest: o.coop.nest }
    : null;
  const st = { carrying: o.carrying ?? false, breakCalls: [] as boolean[], placeArgs: [] as number[][] };
  const animals: AnimalApi = {
    rayHit: () => (o.hitAnimal ? { id: 7, distance: 1.5 } : null),
    preview: () => 'feed',
    feed: (id, item) => (log.push(`feed ${id} ${item}`), o.feed === undefined ? 'ate' : o.feed),
    pet: () => 'friend',
    isFriend: () => false,
    emitHint: (h) => void hints.push(h),
    forEachVisible: () => {},
    swingNet: () => ({ caught: false, reason: 'miss' }),
    carryHold: () => 'wait',
    putDown: () => {
      log.push('putDown');
      return o.putDown ?? true;
    },
    putDownWhy: o.putDownWhy === undefined ? undefined : () => o.putDownWhy ?? null,
    carrying: () => (st.carrying ? 7 : null),
    placeCoop: (x, y, z, dir) => (st.placeArgs.push([x, y, z, dir ?? -1]), log.push('placeCoop'), o.placeResult ?? 1),
    previewCoop: (x, y, z, dir = 0) => ({ x, y, z, dir, ok: o.previewOk ?? true }),
    kits: () => [],
    coops: () => (o.coopsCount ? Array.from({ length: o.coopsCount }, (_, i) => ({ id: i + 1, x: 60, y: 0, z: 60, dir: 0, gate: { x: 0, z: 0 }, kids: [], nest: { egg: 0, gold: 0 } }) as CoopInfo) : coopInfo ? [coopInfo] : []),
    kitAt: () => (o.kitEgg ? ({ x: 5, y: 10, z: 6, egg: 'egg', left: 100, wobble: 0 } as KitInfo) : null),
    coopAt: (x, y, z) => (coopInfo && x === 5 && y === 10 && z === 6 ? coopInfo : null),
    useKit: (_x, _y, _z, held) => (log.push(`useKit ${held}`), o.useKit ?? (held === 'egg' || held === 'kin_tamago' ? 'put' : 'needEgg')),
    collectCoop: (id) => (log.push(`collect ${id}`), o.collected ?? { egg: 2, gold: 1 }),
    breakCoop: (id, first) => (st.breakCalls.push(first), log.push(`breakCoop ${id}`), o.locked ? 'locked' : 'ok'),
    removeCoop: (id) => (log.push(`removeCoop ${id}`), o.removeOk ?? true),
    machoMiss: () => 0,
    serialize: () => ({ v: 3, friends: [], coops: [], kits: [], machoMiss: 0 }),
    deserialize: () => {},
    forEachKit: () => {},
    forEachCoop: () => {},
  };
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), () => 0, null, {
    animals,
    onPickup: (i, n) => void picked.push([i, n]),
    scatterItem: (_p, i, n) => void log.push(`scatter ${i} ${n}`),
    vitals: { hp: () => 5, maxHp: () => 10, heal: (n) => n },
  });
  dig.update();
  actions.endFrame();
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      dig.update();
      for (const e of dig.drainEvents()) events.push(e);
      actions.endFrame();
    }
  };
  const tap = () => {
    actions.press('secondary');
    step(1);
    actions.release('secondary');
    step(1);
  };
  return { dig, actions, inv, log, hints, st, world, step, tap, blocks, added, events, picked, fake };
}

const BOX: BlockId[] = ['toriya_fence', 'toriya_gate', 'toriya_nest', 'toriya_box'];

describe('DigSystem 右クリック（LIVE-2）', () => {
  it('1a: egg で から の こたつ → A に 聞いて 入れた なら egg を 1 へらす', () => {
    const r = rig({ held: 'egg', target: 'nukunuku' });
    r.step(2);
    expect(r.dig.previewRightClick()?.kind).toBe('kitPut');
    r.tap();
    expect(r.log).toContain('useKit egg');
    expect(r.fake!.count).toBe(2);
  });
  it('1a: kin_tamago も 入る', () => {
    const r = rig({ held: 'kin_tamago', target: 'nukunuku' });
    r.step(2);
    r.tap();
    expect(r.log).toContain('useKit kin_tamago');
    expect(r.fake!.count).toBe(2);
  });
  it('1a: すで → kitNeedEgg の 合図、入って いる → kitWait、6 つ → kitMax（持ち物 は へらない）', () => {
    const a = rig({ held: null, target: 'nukunuku' });
    a.step(2);
    a.tap();
    expect(a.hints).toEqual(['kitNeedEgg']);
    const b = rig({ held: 'egg', target: 'nukunuku', kitEgg: true, useKit: 'wait' });
    b.step(2);
    expect(b.dig.previewRightClick()?.kind).toBe('kitWait');
    b.tap();
    expect(b.hints).toEqual(['kitWait']);
    expect(b.fake!.count).toBe(3);
    const c = rig({ held: 'egg', target: 'nukunuku', useKit: 'max' });
    c.step(2);
    c.tap();
    expect(c.hints).toEqual(['kitMax']);
    expect(c.fake!.count).toBe(3);
  });
  it('1a: トマト は たべず kitNeedEgg', () => {
    const r = rig({ held: 'tomato', target: 'nukunuku' });
    r.step(2);
    r.tap();
    expect(r.hints).toEqual(['kitNeedEgg']);
    expect(r.log.some((l) => l.startsWith('eat'))).toBe(false);
  });
  it('1b: 小屋 の さく を ねらって つち → 置かず あつめる（egg 2・kin_tamago 1 を 持ち物 へ）', () => {
    const r = rig({ held: 'dirt', target: 'toriya_fence', coop: { nest: { egg: 2, gold: 1 }, kids: [9] } });
    r.step(2);
    expect(r.dig.previewRightClick()?.kind).toBe('coopCollect');
    r.tap();
    expect(r.log).toContain('collect 3');
    expect(r.added).toEqual([]); // 持ち物 へ 入れる のは A（collectCoop）。ここ は 知らせ だけ
    expect(r.picked).toEqual([['egg', 2], ['kin_tamago', 1]]);
    expect(r.blocks.get('4,10,6')).toBeUndefined(); // つち は 置かない
    expect(r.fake!.count).toBe(3);
  });
  it('1b: 0 こ で すで → coopNoEgg。0 こ で つち → となり に 置く', () => {
    const a = rig({ held: null, target: 'toriya_gate', coop: { nest: { egg: 0, gold: 0 }, kids: [] } });
    a.step(2);
    a.tap();
    expect(a.hints).toEqual(['coopNoEgg']);
    const b = rig({ held: 'dirt', target: 'toriya_fence', coop: { nest: { egg: 0, gold: 0 }, kids: [] } });
    b.step(2);
    b.tap();
    expect(b.blocks.get('4,10,6')).toBe('dirt');
  });
  it('10a: toriya で 置く → placeCoop（もん は プレイヤー の 西 → dir 3）・toriya 1 へる・place 出来事（実績）', () => {
    const r = rig({ held: 'toriya', target: 'stone', count: 2 });
    r.step(2);
    expect(r.dig.previewRightClick()?.kind).toBe('coopPlace');
    r.tap();
    expect(r.st.placeArgs).toEqual([[4, 10, 6, 3]]);
    expect(r.fake!.count).toBe(1);
    expect(r.events.some((e) => e.type === 'place' && e.id === 'toriya_fence')).toBe(true);
  });
  it('10a: 入らない → coopNoRoom（へらない）。4 つ目 → プレビュー coopMax・クリック で coopMax', () => {
    const a = rig({ held: 'toriya', target: 'stone', previewOk: false, placeResult: 'noRoom' });
    a.step(2);
    expect(a.dig.previewRightClick()?.kind).toBe('coopNoRoom');
    a.tap();
    expect(a.hints).toEqual(['coopNoRoom']);
    expect(a.fake!.count).toBe(3);
    const b = rig({ held: 'toriya', target: 'stone', coopsCount: 3, placeResult: 'max' });
    b.step(2);
    expect(b.dig.previewRightClick()?.kind).toBe('coopMax');
    b.tap();
    expect(b.hints).toEqual(['coopMax']);
    expect(b.fake!.count).toBe(3);
  });
  it('だっこ 中 は 小屋 を ねらっても おろす だけ（あつめない・置かない）', () => {
    const r = rig({ held: 'dirt', target: 'toriya_fence', coop: { nest: { egg: 2, gold: 0 }, kids: [] }, carrying: true });
    r.step(2);
    expect(r.dig.previewRightClick()?.kind).toBe('putDown');
    r.tap();
    expect(r.log).toContain('putDown');
    expect(r.log.some((l) => l.startsWith('collect'))).toBe(false);
  });
  it('ねて いる 子 に むし → sleepHint', () => {
    const r = rig({ held: 'mushi', target: 'stone', hitAnimal: true, feed: 'sleep' });
    r.step(2);
    r.tap();
    expect(r.hints).toEqual(['sleepHint']);
  });
  it('おろせない: A の 答え（coopFull）を 先 に 使う。なければ 小屋 の 中 の 数。ほか は cantPutHere', () => {
    const a = rig({ held: null, target: 'stone', carrying: true, putDown: false, putDownWhy: 'friendFull' });
    a.step(2);
    a.tap();
    expect(a.hints).toEqual(['friendFull']);
    const b = rig({ held: null, target: 'stone', carrying: true, putDown: false });
    b.step(2);
    b.tap();
    expect(b.hints).toEqual(['cantPutHere']);
  });
});

describe('DigSystem 左クリック（LIVE-2 小屋 を ほる）', () => {
  it('中 に 子 が いる → 押した ステップ に firstPress、押しつづけ は false。ひび 0・ブロック そのまま・removeCoop しない', () => {
    for (const id of BOX) {
      const r = rig({ held: null, target: id, coop: { nest: { egg: 1, gold: 0 }, kids: [9] }, locked: true });
      r.step(2);
      r.actions.press('primary');
      r.step(400);
      r.actions.release('primary');
      r.step(2);
      expect(r.st.breakCalls[0], id).toBe(true);
      expect(r.st.breakCalls.slice(1).every((f) => f === false), id).toBe(true);
      expect(r.st.breakCalls.length, '毎ステップ 聞く（チップ を 保つ）').toBeGreaterThan(300);
      expect(r.dig.state().crackStage, id).toBe(0);
      expect(r.blocks.get('5,10,6'), id).toBe(id);
      expect(r.log.some((l) => l.startsWith('removeCoop'))).toBe(false);
    }
  });
  it('子 0 → ふつう に ほれる。こわれる と removeCoop・toriya 1 を わたす・break 出来事', () => {
    const r = rig({ held: null, target: 'toriya_fence', coop: { nest: { egg: 0, gold: 0 }, kids: [] } });
    r.step(2);
    r.actions.press('primary');
    r.step(600);
    r.actions.release('primary');
    r.step(2);
    r.actions.press('primary'); // MAX の あと は 押し直した 瞬間 に こわれる
    r.step(2);
    r.actions.release('primary');
    r.step(2);
    expect(r.log).toContain('removeCoop 3');
    expect(r.log).toContain('scatter toriya 1'); // toriya 1 は 足もと に おちる（仕様 AC14）
    expect(r.events.some((e) => e.type === 'break' && e.id === 'toriya_fence')).toBe(true);
    expect(r.blocks.get('5,10,6')).toBe('air');
  });
  it('removeCoop が 断った（子 が いた）なら こわれない・toriya も わたさない', () => {
    const r = rig({ held: null, target: 'toriya_nest', coop: { nest: { egg: 0, gold: 0 }, kids: [] }, removeOk: false });
    r.step(2);
    r.actions.press('primary');
    r.step(600);
    r.actions.release('primary');
    r.step(2);
    r.actions.press('primary');
    r.step(2);
    r.actions.release('primary');
    r.step(2);
    expect(r.added.some(([i]) => i === 'toriya')).toBe(false);
    expect(r.blocks.get('5,10,6')).toBe('toriya_nest');
  });
  it('小屋 で ない ブロック は A に 聞かない', () => {
    const r = rig({ held: null, target: 'stone' });
    r.step(2);
    r.actions.press('primary');
    r.step(20);
    expect(r.st.breakCalls.length).toBe(0);
  });
  it('だっこ 中 は 押しても 小屋 の ことを 聞かない', () => {
    const r = rig({ held: null, target: 'toriya_box', coop: { nest: { egg: 1, gold: 0 }, kids: [9] }, locked: true, carrying: true });
    r.step(2);
    r.actions.press('primary');
    r.step(300);
    expect(r.st.breakCalls.length).toBe(0);
    expect(r.blocks.get('5,10,6')).toBe('toriya_box');
  });
});

