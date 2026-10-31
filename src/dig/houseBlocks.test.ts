import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, PlayerState, TargetInfo, VoxelWorld } from '../contracts';
import { HouseBook } from '../house/book';
import { watchBlocks } from '../house/blockWatch';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { FURN_BLOCK_KINDS, FURN_LEN, K_TANSU, doorInfo, furnBlockId, furnPlaceCells, isFurnKind, type FurnBlockKind } from '../world/blocks/houseBlocks';
import { actionHintLines } from '../ui/actionHintModel';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import { previewRightClick } from './rightClick';

/**
 * HOUSE-1C PR-1（AC24〜AC27・AC52・AC54）: 家具・戸を 置く／ほる／あけしめ。向きは プレイヤーの ほうを 向く。
 * すべての マスが あいて いなければ 何も 置かず 何も へらさない。ほると 家具は ぜんぶの マスが 消えて もとの アイテム 1 こ。
 */

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
    return b !== 'outside' && b !== 'air' && b !== 'water' && !(b.startsWith('house_door') && doorInfo(b)!.open);
  }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.setBlock(x, y, z, id);
  }
}

class Rig {
  world = new FakeWorld();
  actions = new ActionState();
  inv = new InventoryImpl();
  player: PlayerState = {
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
  lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  dig = new DigSystemImpl(this.world, () => this.player, this.actions, this.lock, this.inv, () => 1.62, createDigConfig(), () => 0);
  constructor() {
    this.world.fill(0, 8, 0, 20, 8, 20, 'stone');
    this.step();
  }
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      this.dig.update();
      this.actions.endFrame();
    }
  }
  hold(item: ItemId, count = 1) {
    this.inv.clear();
    this.inv.setSlot(0, { item, count });
    this.inv.select(0);
    this.step();
  }
  rightClick() {
    this.actions.press('secondary');
    this.step();
    this.actions.release('secondary');
    this.step();
  }
  breakAimed() {
    this.actions.press('primary');
    for (let i = 0; i < 900 && !this.dig.state().ready; i++) this.step();
    this.actions.release('primary');
    this.actions.press('primary');
    this.step();
    this.actions.release('primary');
    this.step();
  }
  /** ゆかを ななめ下に ねらう（プレイヤーは 西にいて yaw の ほうを 向く）。置く マス */
  aimFloor(yaw: number) {
    this.player.yawDeg = yaw;
    this.player.pitchDeg = -35;
    // yaw ごとに 中央 (10, 10) の 手前に 立つ
    const spot: Record<number, [number, number]> = { 0: [10.5, 14.5], 90: [6.5, 10.5], 180: [10.5, 6.5], 270: [14.5, 10.5] };
    const [x, z] = spot[yaw]!;
    this.player.position = { x, y: 9, z };
    this.step();
    return this.dig.target()!.place;
  }
}

const NEW_KINDS = FURN_BLOCK_KINDS.filter((k) => !isFurnKind(k, K_TANSU) && k !== 'furnace');

describe('向きの ある 家具を 置く', () => {
  for (const kind of NEW_KINDS) {
    it(`${kind}: プレイヤーの ほうを 向けて ${FURN_LEN[kind]} マス。1 つ へる`, () => {
      for (const yaw of [0, 90, 180, 270]) {
        const r = new Rig();
        r.hold(kind, 2);
        const p = r.aimFloor(yaw);
        const want = furnPlaceCells(kind, yaw, p.x, p.z);
        for (const c of want.cells) expect(r.world.getBlock(c.x, p.y, c.z), `置く前 ${yaw}`).toBe('air');
        r.rightClick();
        for (const c of want.cells) expect(r.world.getBlock(c.x, p.y, c.z), `${kind} yaw ${yaw} (${c.x},${c.z})`).toBe(c.id);
        expect(want.rot).toBe(((yaw / 90) % 4) as 0 | 1 | 2 | 3);
        expect(r.inv.count(kind), '1 つ へる').toBe(1);
      }
    });
  }

  for (const kind of ['table', 'ofuro', 'long_table'] as const) {
    it(`${kind}: どれか 1 マスでも ふさがって いたら 何も 置かず 何も へらさない`, () => {
      const probe = new Rig();
      probe.hold(kind, 1);
      const p = probe.aimFloor(90);
      const cells = furnPlaceCells(kind, 90, p.x, p.z).cells;
      for (const blocked of cells.filter((c) => c.x !== p.x || c.z !== p.z)) {
        const r = new Rig();
        r.hold(kind, 1);
        r.aimFloor(90);
        r.world.setBlock(blocked.x, p.y, blocked.z, 'stone');
        r.rightClick();
        for (const c of cells) if (c.x !== blocked.x || c.z !== blocked.z) expect(r.world.getBlock(c.x, p.y, c.z), `${kind} 残りの マスにも 置かない`).toBe('air');
        expect(r.inv.count(kind), 'へらない').toBe(1);
      }
    });
  }

  it('たんす・かまども プレイヤーの ほうを 向く（rot 0 は 今の id、ほかは 向きごとの id）', () => {
    for (const kind of ['tansu', 'furnace'] as const) {
      for (const yaw of [0, 90, 180, 270]) {
        const r = new Rig();
        r.hold(kind, 1);
        const p = r.aimFloor(yaw);
        r.rightClick();
        expect(r.world.getBlock(p.x, p.y, p.z), `${kind} yaw ${yaw}`).toBe(furnBlockId(kind, 0, ((yaw / 90) % 4) as 0 | 1 | 2 | 3));
      }
    }
  });
});

describe('くさ・チョークの しるしの 上に 家具を 置く（main では 置けた。FLORA-75・MINE-1B）', () => {
  for (const kind of ['tansu', 'furnace', 'chair', 'table', 'long_table'] as const) {
    it(`${kind}: くさを ねらうと くさの マスに 置ける（くさは 消える）。2 マス目が くさでも 置ける`, () => {
      const r = new Rig();
      r.hold(kind, 1);
      const p = r.aimFloor(90);
      const cells = furnPlaceCells(kind, 90, p.x, p.z).cells;
      for (const c of cells) r.world.setBlock(c.x, p.y, c.z, 'kusa'); // ねらった マスも ほかの マスも くさ
      r.step();
      expect(r.dig.target()?.id, 'くさを ねらって いる').toBe('kusa');
      r.rightClick();
      for (const c of cells) expect(r.world.getBlock(c.x, p.y, c.z), `${kind} (${c.x},${c.z})`).toBe(c.id);
      expect(r.inv.count(kind), '1 つ へる').toBe(0);
    });
  }

  it('チョークの しるしを ねらっても 置ける。ほかの ブロックが ある マスは これまでどおり 置けない', () => {
    const r = new Rig();
    r.hold('tansu', 1);
    const p = r.aimFloor(90);
    r.world.setBlock(p.x, p.y, p.z, 'chalk_mark');
    r.step();
    expect(r.dig.target()?.id).toBe('chalk_mark');
    r.rightClick();
    expect(r.world.getBlock(p.x, p.y, p.z)).toBe(furnBlockId('tansu', 0, 1));
    const q = new Rig();
    q.hold('table', 1);
    const pq = q.aimFloor(90);
    const second = furnPlaceCells('table', 90, pq.x, pq.z).cells.find((c) => c.x !== pq.x || c.z !== pq.z)!;
    q.world.setBlock(second.x, pq.y, second.z, 'dirt');
    q.rightClick();
    expect(q.world.getBlock(pq.x, pq.y, pq.z), '2 マス目が つちなら 置かない').toBe('air');
    expect(q.inv.count('table')).toBe(1);
  });
});

describe('家具を ほる（AC25・AC27）', () => {
  for (const kind of FURN_BLOCK_KINDS) {
    it(`${kind}: どの マスを ほっても ぜんぶ 消えて ${kind} が 1 こ`, () => {
      let checked = 0;
      for (let pick = 0; pick < FURN_LEN[kind]; pick++) {
        for (const yaw of [0, 270]) {
          const r = new Rig();
          const cells = furnPlaceCells(kind, yaw, 10, 10).cells;
          for (const c of cells) r.world.setBlock(c.x, 9, c.z, c.id);
          // ほる マスの 南がわ（北向きに 立って）か 東がわ から まっすぐ ねらう
          const t = cells[pick]!;
          r.player.position = { x: t.x + 0.5, y: 9, z: t.z + 3.5 };
          r.player.yawDeg = 0;
          r.player.pitchDeg = -30;
          r.step();
          const aimed = r.dig.target();
          if (!aimed || aimed.block.x !== t.x || aimed.block.z !== t.z) continue; // 手前の マスに さえぎられた とき（2 方向のうち 通る 向きで 調べる）
          r.inv.clear();
          r.inv.select(0);
          r.breakAimed();
          checked++;
          for (const c of cells) expect(r.world.getBlock(c.x, 9, c.z), `${kind} yaw ${yaw} pick ${pick}: ${c.id}`).toBe('air');
          expect(r.inv.count(kind), 'もとの アイテム 1 こ').toBe(1);
        }
      }
      expect(checked, '実際に ほった 回数（ねらいが はずれて 飛ばした だけに しない）').toBeGreaterThanOrEqual(FURN_LEN[kind]);
    });
  }

  it('向きちがい（tansu_w）を ほっても tansu 1 こ。たんすの 中身の しくみ（storage）は たんす だけ', () => {
    const r = new Rig();
    r.world.setBlock(4, 10, 6, 'tansu_w');
    r.step();
    expect(r.dig.target()?.id).toBe('tansu_w');
    expect(isFurnKind('tansu_w', K_TANSU)).toBe(true);
    r.breakAimed();
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    expect(r.inv.count('tansu')).toBe(1);
    expect(r.inv.count('tansu_w' as ItemId)).toBe(0);
  });
});

describe('家の ブロックを ほる／置く（AC24）', () => {
  for (const id of ['house_floor', 'house_wall', 'house_roof', 'shoji'] as const) {
    it(`${id}: 右クリックで 置ける（1 つ へる）。ほると ${id} が 1 こ`, () => {
      const r = new Rig();
      r.hold(id, 2);
      const p = r.aimFloor(90);
      r.rightClick();
      expect(r.world.getBlock(p.x, p.y, p.z)).toBe(id);
      expect(r.inv.count(id)).toBe(1);
      r.inv.clear();
      r.inv.select(0);
      r.player.pitchDeg = -35;
      r.step();
      r.breakAimed();
      expect(r.world.getBlock(p.x, p.y, p.z)).toBe('air');
      expect(r.inv.count(id)).toBe(1);
    });
  }
});

describe('戸（AC26・AC52）', () => {
  /** 戸を 1 つ 置いて、置いた マスを 返す */
  function placed(): { r: Rig; p: { x: number; y: number; z: number } } {
    const r = new Rig();
    r.hold('house_door', 2);
    const p = r.aimFloor(90);
    r.rightClick();
    return { r, p };
  }
  const ids = (r: Rig, p: { x: number; y: number; z: number }): string[] => [r.world.getBlock(p.x, p.y, p.z), r.world.getBlock(p.x, p.y + 1, p.z)];

  it('置くと 上下 2 マス（しまった 戸）。1 つ へる', () => {
    const { r, p } = placed();
    expect(ids(r, p)).toEqual(['house_door', 'house_door_top']);
    expect(r.inv.count('house_door')).toBe(1);
  });

  it('上の マスが ふさがって いたら 置けない（へらない）', () => {
    const r = new Rig();
    r.hold('house_door', 1);
    const p = r.aimFloor(90);
    r.world.setBlock(p.x, p.y + 1, p.z, 'stone');
    r.rightClick();
    expect(r.world.getBlock(p.x, p.y, p.z)).toBe('air');
    expect(r.inv.count('house_door')).toBe(1);
  });

  it('右クリックで あく → もう 1 回で しまる。2 マス いっしょ。上を ねらっても 同じ', () => {
    const { r, p } = placed();
    r.inv.clear();
    r.inv.select(0);
    r.player.position = { x: p.x - 2.5, y: 9, z: p.z + 0.5 };
    r.player.pitchDeg = 0;
    r.step();
    expect(r.dig.target()?.block).toEqual({ x: p.x, y: p.y + 1, z: p.z });
    r.rightClick();
    expect(ids(r, p)).toEqual(['house_door_open', 'house_door_open_top']);
    r.rightClick();
    expect(ids(r, p)).toEqual(['house_door', 'house_door_top']);
    r.player.pitchDeg = -15; // 下の 半分を ねらう
    r.step();
    expect(r.dig.target()?.block.y).toBe(p.y);
    r.rightClick();
    expect(ids(r, p)).toEqual(['house_door_open', 'house_door_open_top']);
  });

  it('あいた 戸も ねらえて、ほれる（上下 どちらを ほっても 2 マス 消えて house_door 1 こ）', () => {
    for (const open of [false, true]) {
      for (const half of ['lo', 'hi'] as const) {
        const { r, p } = placed();
        r.inv.clear();
        r.inv.select(0);
        if (open) {
          r.world.setBlock(p.x, p.y, p.z, 'house_door_open');
          r.world.setBlock(p.x, p.y + 1, p.z, 'house_door_open_top');
        }
        r.player.position = { x: p.x - 2.5, y: 9, z: p.z + 0.5 };
        r.player.pitchDeg = half === 'hi' ? 8 : -12;
        r.step();
        const aimed = r.dig.target();
        expect(aimed?.block.x, `open=${open} ${half}`).toBe(p.x);
        expect(doorInfo(aimed!.id), `open=${open} ${half}`).not.toBeNull();
        r.breakAimed();
        expect(ids(r, p), `open=${open} ${half}`).toEqual(['air', 'air']);
        expect(r.inv.count('house_door')).toBe(1);
      }
    }
  });

  it('戸を ほると 家の 記録が 消える。もう 1 回 置いても 記録は もどらない', () => {
    const { r, p } = placed();
    const book = new HouseBook();
    book.add({ name: 'ひみつきち', front: 'ひみつ', back: 'きち', number: 1, outer: { w: 7, d: 7 }, door: { x: p.x, y: p.y, z: p.z }, doorOpen: false });
    watchBlocks(r.world as never, { blockChanged: () => {}, blocksChanged: () => {}, cellChanged: (x, y, z, id) => book.cellChanged(x, y, z, id) });
    expect(book.count()).toBe(1);
    r.inv.clear();
    r.inv.select(0);
    r.player.position = { x: p.x - 2.5, y: 9, z: p.z + 0.5 };
    r.player.pitchDeg = -12;
    r.step();
    r.rightClick();
    expect(book.list()[0]!.doorOpen, '右クリックで あいた').toBe(true);
    r.breakAimed();
    expect(book.count(), 'ほると 消える').toBe(0);
    r.hold('house_door', 1);
    r.aimFloor(90);
    r.rightClick();
    expect(book.count(), '置きなおしても もどらない').toBe(0);
  });
});

describe('右の 案内（AC54）', () => {
  const target = (id: BlockId): TargetInfo => ({ block: { x: 4, y: 10, z: 6 }, id, face: { x: -1, y: 0, z: 0 }, place: { x: 3, y: 10, z: 6 }, distance: 1.5 });
  const ctx = (held: ItemId | null, t: TargetInfo | null) => ({ target: t, held, isTansu: () => false, isFurnace: () => false, canEquip: () => false, canPlace: () => false });

  it('戸: しまって いる ＝ あける・あいて いる ＝ しめる（上下 どちらでも・何を 持って いても）', () => {
    for (const id of ['house_door', 'house_door_top'] as const) {
      for (const held of [null, 'stone', 'house_door'] as const) expect(previewRightClick(ctx(held, target(id)))?.kind, `${id} ${held}`).toBe('doorOpen');
    }
    for (const id of ['house_door_open', 'house_door_open_top'] as const) expect(previewRightClick(ctx(null, target(id)))?.kind, id).toBe('doorClose');
  });

  it('ことばは「あける」「しめる」。長い テーブル・まるい テーブル・あんどん・はにわ・いすなどは 案内なし', () => {
    const hint = { held: null, heldIsPickaxe: false, heldIsBlade: false };
    expect(actionHintLines({ kind: 'doorOpen', item: null }, null, hint).right).toEqual({ icon: 'house_door', word: 'あける' });
    expect(actionHintLines({ kind: 'doorClose', item: null }, null, hint).right).toEqual({ icon: 'house_door', word: 'しめる' });
    for (const id of ['long_table', 'long_table_2_n', 'round_table', 'andon', 'haniwa', 'chair_w', 'shelf', 'ofuro_2_e', 'table', 'stool', 'shoji'] as const) {
      expect(previewRightClick(ctx(null, target(id))), id).toBeNull();
    }
  });

  it('家具の しゅるいは ぜんぶ 型で そろっている（FurnBlockKind）', () => {
    const kinds: FurnBlockKind[] = [...FURN_BLOCK_KINDS];
    expect(kinds).toHaveLength(10);
  });
});
