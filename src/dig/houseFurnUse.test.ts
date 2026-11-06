import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, PlayerState, TargetInfo, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { actionHintLines } from '../ui/actionHintModel';
import { FURN_BLOCK_IDS, FURN_BLOCK_KINDS, furnInfo, type FurnBlockKind } from '../world/blocks/houseBlocks';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import { previewRightClick } from './rightClick';

/**
 * HOUSE-1D（#341。仕様 docs/design/HOUSE-1.md §2.12・AC28・AC54）: 家具への 右クリック。
 *  ・右の 案内（AC54）: いす・まるいす「すわる」、おふろ「はいる」、ほんだな「よむ」。テーブル（ながい・まるい も）・あんどん・はにわは 案内なし。
 *  ・実行: 右クリックの ひろい先が 家具の はたらきの 出口へ 1 回 だけ とどく（座る・入る・本を 開く）。
 *
 * 約束（票 docs/tickets/HOUSE-1D.md「テストの 準備」）:
 *  ・`RightClickKind` に 'sit'（いす・まるいす）・'bath'（おふろ）・'read'（ほんだな）を 足す。判定は previewRightClick（置くより 先・何を 持っていても 同じ）。
 *  ・DigSystem の 最後の 引数（DigM4Deps）に `furniture?: { use(kind: 'sit' | 'bath' | 'read', x: number, y: number, z: number): void }`。
 *    右クリックを 押した 最初の ステップに 1 回だけ。x・y・z は ねらった ブロックの マス（2 マス・3 マスの 家具は ねらった マス）。
 */

// ---------------------------------------------------------------- 右の 案内（AC54）

/** 家具の しゅるいごとの 期待。新しい しゅるいを 足すと ここが 型で 落ちる（足し忘れ ふせぎ） */
const WANT = {
  tansu: null, // 今までの まま（たんす・かまどは 別の 道。この テストでは 見ない）
  furnace: null,
  table: null,
  long_table: null,
  round_table: null,
  andon: null,
  chair: { kind: 'sit', word: 'すわる' },
  stool: { kind: 'sit', word: 'すわる' },
  ofuro: { kind: 'bath', word: 'はいる' },
  shelf: { kind: 'read', word: 'よむ' },
} as const satisfies Record<FurnBlockKind, { kind: string; word: string } | null>;
const NEW_KINDS = FURN_BLOCK_KINDS.filter((k) => k !== 'tansu' && k !== 'furnace');

const target = (id: BlockId): TargetInfo => ({ block: { x: 4, y: 10, z: 6 }, id, face: { x: -1, y: 0, z: 0 }, place: { x: 3, y: 10, z: 6 }, distance: 1.5 });
const ctx = (held: ItemId | null, t: TargetInfo | null, canPlace = false) => ({ target: t, held, isTansu: () => false, isFurnace: () => false, canEquip: () => false, canPlace: () => canPlace });
const hint = { held: null, heldIsPickaxe: false, heldIsBlade: false };

describe('右の 案内（AC54）', () => {
  for (const kind of NEW_KINDS) {
    const want = WANT[kind];
    const ids = FURN_BLOCK_IDS.filter((id) => furnInfo(id)!.kind === kind);
    it(`${kind}: ${want ? `${want.word}（どの マスでも・どの 向きでも・何を 持って いても）` : '案内なし'}`, () => {
      expect(ids.length, '調べる id が ある').toBeGreaterThan(0);
      for (const id of ids) {
        for (const [held, canPlace] of [[null, false], ['stone', true], ['house_door', true]] as const) {
          const pv = previewRightClick(ctx(held, target(id), canPlace));
          const label = `${id} 持ち物 ${held}`;
          if (want === null) {
            expect(pv?.kind ?? null, `${label}: はたらき なし`).toBe(canPlace ? 'place' : null); // 置ける 物を 持って いれば ふつうに 置く だけ
            if (!canPlace) expect(actionHintLines(pv, null, hint).right, `${label}: 案内なし`).toBeUndefined();
          } else {
            expect(pv?.kind, label).toBe(want.kind);
            expect(actionHintLines(pv, null, hint).right?.word, label).toBe(want.word);
          }
        }
      }
    });
  }

  it('はにわ（今の 置き物）・戸・しょうじ は 家具としての 案内を 出さない（戸の「あける」は 1C の まま）', () => {
    for (const id of ['haniwa', 'shoji', 'house_wall', 'house_floor'] as const) {
      expect(previewRightClick(ctx(null, target(id))), id).toBeNull();
    }
    expect(previewRightClick(ctx(null, target('house_door')))?.kind).toBe('doorOpen');
  });
});

// ---------------------------------------------------------------- 実行

class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  blocks = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64) return 'outside';
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    if (this.getBlock(x, y, z) === 'outside') return false;
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && b !== 'air' && b !== 'water';
  }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.setBlock(x, y, z, id);
  }
}

type Use = readonly [kind: string, x: number, y: number, z: number];
const FLOOR_Y = 8;
const AT = { x: 10, y: FLOOR_Y + 1, z: 10 };

class Rig {
  world = new FakeWorld();
  actions = new ActionState();
  inv = new InventoryImpl();
  uses: Use[] = [];
  player: PlayerState = {
    position: { x: AT.x + 0.5, y: AT.y, z: AT.z + 4.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 0,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false,
    facingDeg: 0,
    running: false,
  };
  lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  // 出口の 型は 実装が 足す（票）。足すまでは 型を 通すため never で わたす
  dig = new DigSystemImpl(this.world, () => this.player, this.actions, this.lock, this.inv, () => 1.62, createDigConfig(), () => 0, null, {
    furniture: { use: (kind: string, x: number, y: number, z: number) => void this.uses.push([kind, x, y, z]) },
  } as never);
  constructor(id: BlockId) {
    this.world.fill(0, FLOOR_Y, 0, 20, FLOOR_Y, 20, 'stone');
    this.world.setBlock(AT.x, AT.y, AT.z, id);
    // 家具の 南 4 マスから、家具の まん中を ねらう（目の 高さ ＝ 足もと ＋ 1.62）
    this.player.pitchDeg = (-Math.atan2(1.62 - 0.5, 3.5) * 180) / Math.PI;
    this.step();
  }
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      this.dig.update();
      this.actions.endFrame();
    }
  }
  hold(item: ItemId) {
    this.inv.clear();
    this.inv.setSlot(0, { item, count: 5 });
    this.inv.select(0);
    this.step();
  }
  rightClick() {
    this.actions.press('secondary');
    this.step();
    this.actions.release('secondary');
    this.step();
  }
}

const wantUses = (kind: FurnBlockKind): Use[] => {
  const w = WANT[kind];
  return w === null ? [] : [[w.kind, AT.x, AT.y, AT.z]];
};

describe('右クリックの 実行（AC28）', () => {
  for (const kind of NEW_KINDS) {
    const ids = FURN_BLOCK_IDS.filter((id) => furnInfo(id)!.kind === kind);
    it(`${kind}: ${WANT[kind] ? `どの マスの ブロックでも ${WANT[kind]!.kind} が 1 回 とどく` : '何も とどかない'}`, () => {
      for (const id of ids) {
        const r = new Rig(id);
        expect(r.dig.target()?.id, `${id} を ねらえて いる`).toBe(id);
        r.rightClick();
        expect(r.uses, id).toEqual(wantUses(kind));
        expect(r.world.getBlock(AT.x, AT.y, AT.z), `${id} は 残る`).toBe(id);
      }
    });
  }

  it('座れる／入れる／本の 家具は 何かを 持って いても はたらきが 先（ブロックは 置かない・へらない）', () => {
    for (const id of ['chair', 'stool_w', 'ofuro', 'ofuro_2_e', 'shelf_n'] as const) {
      const r = new Rig(id);
      r.hold('stone');
      r.rightClick();
      expect(r.uses.length, `${id}`).toBe(1);
      expect(r.inv.count('stone'), `${id}: ブロックは へらない`).toBe(5);
      const around = [...r.world.blocks.entries()].filter(([, b]) => b === 'stone').map(([k]) => k);
      expect(
        around.every((k) => k.split(',')[1] === String(FLOOR_Y)),
        `${id}: ゆか の 上には 何も 置かれて いない`,
      ).toBe(true);
    }
  });

  it('テーブル・あんどんに 石を 持って 右クリックすると ふつうに 置ける（はたらきは 出ない）', () => {
    for (const id of ['table', 'long_table', 'andon'] as const) {
      const r = new Rig(id);
      r.hold('stone');
      r.rightClick();
      expect(r.uses, id).toEqual([]);
      expect(r.inv.count('stone'), `${id}: 置いて 1 こ へる`).toBe(4);
    }
  });

  it('押しつづけても 1 回だけ（新しく 押した ステップだけ）。はなして また 押すと もう 1 回', () => {
    const r = new Rig('chair');
    r.actions.press('secondary');
    r.step(40);
    r.actions.release('secondary');
    r.step(2);
    expect(r.uses.length, '押しつづけ').toBe(1);
    r.rightClick();
    expect(r.uses.length, 'もう 1 回').toBe(2);
  });
});
