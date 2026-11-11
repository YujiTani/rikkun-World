import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, PlayerState } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { actionHintLines } from '../ui/actionHintModel';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/**
 * HOUSE-2A（#364・仕様 3.3 版 docs/design/HOUSE-2.md §2.2・§6.2 AC1b）: 手に もって 右クリック（よむ）の 判定。たべもの（'eat'）と 同じ 道（src/dig/rightClick.ts）。
 * 約束: 右クリックの 種類 'read'（item ＝ recipe_scroll）。実行は DigSystem の m4 の 口 `scroll.read(who: 1 | 2)`（持ち物を へらして おぼえる のは 家の 係〔house.read〕。ここは 呼ぶ 回数だけ 見る）。
 *   右の 案内 ＝ { icon: 'recipe_scroll', word: 'よむ' }。
 * 見る こと:
 *   ・手に もって いれば 右クリック 1 回で read が 1 回（ねらいが なくても・かたい ブロックを ねらって いても）。長押しで 続けて 使わない。
 *   ・右クリックの はたらきが ある ブロック（たんす・かまど・戸・ふとん・まきものの ブロック）を ねらって いる ときは そちらが 先。read は 呼ばない。
 *   ・手に もって いない（ほかの 物・何も）なら 呼ばない。
 *   ・持ち物の 画面などで 操作できない とき〔lock.overlayVisible〕は 呼ばない（持ち物の 画面で マスを 押しても おぼえない）。
 */

const SCROLL = 'recipe_scroll' as ItemId;
type Who = 1 | 2;

function rig(held: ItemId | null, target: BlockId | null, opts: { overlay?: boolean } = {}) {
  const blocks = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const world = {
    size: { x: 64, y: 32, z: 64 },
    getBlock: (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64 ? 'outside' : (blocks.get(key(x, y, z)) ?? 'air')),
    setBlock: (x: number, y: number, z: number, id: BlockId) => {
      blocks.set(key(x, y, z), id);
      return true;
    },
    isSolid: (x: number, y: number, z: number) => {
      const b = blocks.get(key(x, y, z));
      return !!b && b !== 'air' && b !== 'water';
    },
  };
  for (let x = 0; x <= 12; x++) for (let z = 0; z <= 12; z++) blocks.set(key(x, 8, z), 'stone');
  if (target) blocks.set(key(5, 10, 6), target);
  const player: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false, facingDeg: 0, running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => opts.overlay === true, realtimeAllowed: () => true, playInputEnabled: () => opts.overlay !== true };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  if (held) inv.setSlot(0, { item: held, count: 3 });
  inv.select(0);
  const opened: string[] = [];
  const reads: Who[] = [];
  const m4 = {
    craft: {
      isFurnace: (x: number, y: number, z: number) => world.getBlock(x, y, z) === 'furnace',
      openFurnace: (x: number, y: number, z: number) => opened.push(`furnace ${x},${y},${z}`),
      furnaceBroken: () => {},
      fixedDrop: () => null,
    },
    storage: {
      isTansu: (x: number, y: number, z: number) => world.getBlock(x, y, z) === 'tansu',
      open: (x: number, y: number, z: number) => (opened.push(`tansu ${x},${y},${z}`), true),
      placed: () => {},
      broken: () => 0,
    },
    scroll: { read: (who: Who) => void reads.push(who) },
  };
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), () => 0, null, m4 as never);
  const chestOpened: string[] = [];
  dig.chestPort = { open: (x, y, z, who) => void chestOpened.push(`${x},${y},${z},${who}`) };
  dig.update();
  actions.endFrame();
  return { dig, actions, inv, reads, opened, chestOpened };
}

/** 右クリックを 1 回 おして はなす */
function click(r: ReturnType<typeof rig>): void {
  r.actions.press('secondary');
  r.dig.update();
  r.actions.release('secondary');
  r.actions.endFrame();
}

describe('AC1b 手に もって 右クリック: 判定（previewRightClick）と 実行', () => {
  for (const target of [null, 'stone', 'dirt'] as (BlockId | null)[])
    it(`まきものを 手に もって ${target ?? 'ねらいなし'} を ねらう: 種類 read・右クリック 1 回で read が 1 回（who 1）`, () => {
      const r = rig(SCROLL, target);
      expect(r.dig.previewRightClick()).toMatchObject({ kind: 'read', item: SCROLL });
      click(r);
      expect(r.reads).toEqual([1]);
    });

  it('長押しで 続けて 使わない: おしたまま 60 コマ すすめても read は 1 回。はなして もう 1 回 おすと もう 1 回', () => {
    const r = rig(SCROLL, 'stone');
    r.actions.press('secondary');
    for (let i = 0; i < 60; i++) {
      r.dig.update();
      r.actions.endFrame();
    }
    r.actions.release('secondary');
    r.dig.update();
    r.actions.endFrame();
    expect(r.reads, '長押しは 1 回').toHaveLength(1);
    click(r);
    expect(r.reads, 'はなして もう 1 回').toHaveLength(2);
  });

  it('2P が 右クリックした とき（chestWho ＝ 2）は who 2 で よぶ', () => {
    const r = rig(SCROLL, null);
    r.dig.chestWho = 2;
    click(r);
    expect(r.reads).toEqual([2]);
  });

  for (const target of ['tansu', 'furnace', 'house_door', 'futon', 'makimono'] as BlockId[])
    it(`右クリックの はたらきが ある ブロック（${target}）を ねらって いる ときは そちらが 先: read は 呼ばない`, () => {
      const r = rig(SCROLL, target);
      const kind = r.dig.previewRightClick()?.kind;
      expect(kind, 'まきものを 使う（read）では ない').not.toBe('read');
      expect(kind, 'ほかの はたらきが ある').toBeDefined();
      click(r);
      expect(r.reads, 'まきものは へらない').toEqual([]);
    });

  it('手に もって いない: ほかの 物・何も 持たない・まきものが ホットバーの ほかの マスに ある だけ では 右クリックしても read は 呼ばない', () => {
    for (const held of [null, 'stone', 'dirt', 'torch'] as (ItemId | null)[]) {
      const r = rig(held, 'stone');
      if (held === 'stone') r.inv.setSlot(1, { item: SCROLL, count: 2 }); // 選んで いない マスに ある
      expect(r.dig.previewRightClick()?.kind, `${held ?? 'て'}`).not.toBe('read');
      click(r);
      expect(r.reads, `${held ?? 'て'}`).toEqual([]);
    }
  });

  it('持ち物の 画面など 操作が とまって いる とき（overlayVisible）は 右クリックしても read は 呼ばない', () => {
    const r = rig(SCROLL, null, { overlay: true });
    click(r);
    expect(r.reads).toEqual([]);
  });

  it('右の 案内は「よむ」（まきものの 絵）。ほかの 物を 持って いる ときは 出ない', () => {
    const lines = (held: ItemId | null) => {
      const r = rig(held, null);
      return actionHintLines(r.dig.previewRightClick(), r.dig.previewLeftClick(), { held, heldIsPickaxe: false, heldIsBlade: false });
    };
    expect(lines(SCROLL).right).toEqual({ icon: SCROLL, word: 'よむ' });
    expect(lines('stone').right?.word).not.toBe('よむ');
  });
});
