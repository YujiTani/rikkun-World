import { describe, expect, it } from 'vitest';
import { ITEM_DEFS } from '../../content/items/registry';
import { CHALK_MARK_IDS } from './chalkMark';
import { BLOCK_INDEX, BLOCK_TYPES, isOpaqueIndex, isPropIndex } from './blockTypes';
import {
  FURN_BLOCK_IDS,
  FURN_BLOCK_KINDS,
  FURN_LEN,
  FURN_VARIANT_IDS,
  HOUSE_BLOCK_IDS,
  HOUSE_DOOR_PART_IDS,
  K_FURNACE,
  K_TANSU,
  NEW_FURN_BLOCK_IDS,
  doorId,
  doorInfo,
  furnBlockId,
  furnCellOffset,
  furnCells,
  furnFootprint,
  furnInfo,
  furnPlaceCells,
  furnRotFromYaw,
  furnSiblings,
  houseDropOf,
  isFurnKind,
  rightStep,
  type FurnRot,
} from './houseBlocks';

/**
 * HOUSE-1C PR-1（#340）: 家の ブロック 5 つ・戸の 3 つの 半分・向きの ある 家具 56 この id と、置く マス・ほる 元の アイテム。
 * 向き rot: 0 ＝ 前が 南（+z）→ 1 ＝ 西 → 2 ＝ 北 → 3 ＝ 東（上から 見て 時計まわり）。プレイヤーの ほうを 向けて 置く。
 */

const ROTS: readonly FurnRot[] = [0, 1, 2, 3];
/** rot ごとの 前（家具の おもて）の 向き dx, dz */
const FRONT: Record<FurnRot, readonly [number, number]> = { 0: [0, 1], 1: [-1, 0], 2: [0, -1], 3: [1, 0] };
/** プレイヤーの yaw（0 ＝ 北・90 ＝ 東）の 見ている 向き dx, dz */
const LOOK: Record<number, readonly [number, number]> = { 0: [0, -1], 90: [1, 0], 180: [0, 1], 270: [-1, 0] };

describe('ブロックの 番号', () => {
  it('新しい id は チョークの さいごの 後ろに 並ぶ（古い セーブの 番号は かわらない）', () => {
    const lastChalk = Math.max(...CHALK_MARK_IDS.map((id) => BLOCK_INDEX[id]!));
    const added = [...HOUSE_BLOCK_IDS, ...HOUSE_DOOR_PART_IDS, ...NEW_FURN_BLOCK_IDS];
    expect(added).toHaveLength(5 + 3 + 54);
    const idx = added.map((id) => BLOCK_INDEX[id]!);
    expect(Math.min(...idx), '新しい id は ぜんぶ チョークより 後ろ').toBeGreaterThan(lastChalk);
    expect(idx, '決まった 順で 並ぶ').toEqual([...idx].sort((a, b) => a - b));
    expect(BLOCK_TYPES.length, 'ブロックの 番号は 1 バイト（256 まで）').toBeLessThanOrEqual(256);
  });

  it('たんす・かまどの 今の id（向き 0）は 古い 番号の まま。新しい id には ならない', () => {
    expect(NEW_FURN_BLOCK_IDS).not.toContain('tansu');
    expect(NEW_FURN_BLOCK_IDS).not.toContain('furnace');
    expect(BLOCK_INDEX.tansu).toBeLessThan(BLOCK_INDEX.house_floor!);
    expect(BLOCK_INDEX.furnace).toBeLessThan(BLOCK_INDEX.house_floor!);
  });

  it('向きの ある 家具は 56 こ（1 マス 7 しゅるい × 4 向き ＋ 2 マス 2 しゅるい × 8 ＋ 3 マス × 12）。ぜんぶ ちがう id', () => {
    expect(FURN_BLOCK_IDS).toHaveLength(7 * 4 + 2 * 8 + 12);
    expect(new Set(FURN_BLOCK_IDS).size).toBe(FURN_BLOCK_IDS.length);
    expect(FURN_VARIANT_IDS).toHaveLength(FURN_BLOCK_IDS.length - FURN_BLOCK_KINDS.length);
    for (const id of FURN_BLOCK_IDS) expect(BLOCK_INDEX[id], id).toBeDefined();
  });

  it('ブロックの 名前は 家具の アイテムの 名前（向き・マスちがいも 同じ。元の 表は エディターの FURNITURE）', () => {
    for (const id of FURN_BLOCK_IDS) {
      const f = furnInfo(id)!;
      expect(BLOCK_TYPES[BLOCK_INDEX[id]!]!.name, id).toBe(ITEM_DEFS[f.kind].name);
    }
  });

  it('戸の 上・あけた 下・あけた 上は 持ち物に 入らない id。しょうじ・戸・箱の 家具は 光が とおる 置き物の 道（PROP）', () => {
    expect(HOUSE_DOOR_PART_IDS).toEqual(['house_door_top', 'house_door_open', 'house_door_open_top']);
    for (const id of ['shoji', 'house_door', ...HOUSE_DOOR_PART_IDS, 'chair', 'table_2_w', 'long_table_3_e'] as const) {
      expect(isPropIndex(BLOCK_INDEX[id]!), id).toBe(true);
      expect(isOpaqueIndex(BLOCK_INDEX[id]!), `${id} は 光を ふさがない`).toBe(false);
    }
    // ゆか・かべ・やね・向きごとの たんす・かまどは 平らな 固い 箱
    for (const id of ['house_floor', 'house_wall', 'house_roof', 'tansu', 'tansu_w', 'furnace_e'] as const) expect(isPropIndex(BLOCK_INDEX[id]!), id).toBe(false);
  });
});

describe('戸の id', () => {
  it('下・上 × しめた・あけた の 4 つ。doorId と doorInfo が 行き来できる', () => {
    for (const top of [false, true]) {
      for (const open of [false, true]) expect(doorInfo(doorId(top, open))).toEqual({ top, open });
    }
    expect(doorId(false, false)).toBe('house_door');
    expect(doorInfo('stone')).toBeNull();
  });

  it('あけた 戸は 通れる（固くない）・しまった 戸は 固い', () => {
    const solid = (id: string): boolean => BLOCK_TYPES[BLOCK_INDEX[id as never]!]!.solid;
    expect(solid('house_door')).toBe(true);
    expect(solid('house_door_top')).toBe(true);
    expect(solid('house_door_open')).toBe(false);
    expect(solid('house_door_open_top')).toBe(false);
  });
});

describe('向きと マス', () => {
  it('id は しゅるい ＋（2 つ目 以降は _2・_3）＋（向き 1〜3 は _w・_n・_e）', () => {
    expect(furnBlockId('chair', 0, 0)).toBe('chair');
    expect(furnBlockId('chair', 0, 1)).toBe('chair_w');
    expect(furnBlockId('chair', 0, 2)).toBe('chair_n');
    expect(furnBlockId('chair', 0, 3)).toBe('chair_e');
    expect(furnBlockId('long_table', 2, 3)).toBe('long_table_3_e');
    expect(furnBlockId('table', 1, 0)).toBe('table_2');
    expect(furnInfo('long_table_3_e')).toEqual({ kind: 'long_table', rot: 3, k: 2 });
    expect(furnInfo('stone')).toBeNull();
  });

  it('たんす・かまどを しゅるいで 見分ける（向きが かわっても）', () => {
    for (const rot of ROTS) {
      expect(isFurnKind(furnBlockId('tansu', 0, rot), K_TANSU)).toBe(true);
      expect(isFurnKind(furnBlockId('tansu', 0, rot), K_FURNACE)).toBe(false);
      expect(isFurnKind(furnBlockId('furnace', 0, rot), K_FURNACE)).toBe(true);
    }
    expect(isFurnKind('chair', K_TANSU)).toBe(false);
  });

  it('マスの ならびは 長さの とおり。たて・よこが rot で 入れかわる', () => {
    for (const kind of FURN_BLOCK_KINDS) {
      const len = FURN_LEN[kind];
      for (const rot of ROTS) {
        const cells = furnCells(kind, rot, 10, 10);
        expect(cells, `${kind} rot${rot}`).toHaveLength(len);
        expect(new Set(cells.map((c) => `${c.x},${c.z}`)).size, 'マスは かさならない').toBe(len);
        const [w, d] = furnFootprint(len, 1, rot);
        const xs = cells.map((c) => c.x);
        const zs = cells.map((c) => c.z);
        expect(Math.max(...xs) - Math.min(...xs) + 1, 'よこ').toBe(w);
        expect(Math.max(...zs) - Math.min(...zs) + 1, 'たて').toBe(d);
        expect(Math.min(...xs), '北西の すみが anchor').toBe(10);
        expect(Math.min(...zs)).toBe(10);
        expect(cells.map((c) => furnInfo(c.id)!.k).sort(), 'k は 0 から').toEqual(Array.from({ length: len }, (_, k) => k));
        for (const c of cells) expect(furnInfo(c.id)).toMatchObject({ kind, rot });
        for (let k = 0; k < len; k++) {
          const [dx, dz] = furnCellOffset(len, rot, k);
          expect(cells.find((c) => c.id === furnBlockId(kind, k, rot)), 'furnCellOffset と 同じ').toMatchObject({ x: 10 + dx, z: 10 + dz });
        }
      }
    }
  });
});

describe('置く マス（プレイヤーの ほうを 向く）', () => {
  it('rot は プレイヤーの 向きの さかさ（前が プレイヤーの ほう）。yaw 0・90・180・270 → 0・1・2・3', () => {
    expect([0, 90, 180, 270].map(furnRotFromYaw)).toEqual([0, 1, 2, 3]);
    expect(furnRotFromYaw(360)).toBe(0);
    expect(furnRotFromYaw(-90)).toBe(3);
    expect(furnRotFromYaw(44)).toBe(0);
    expect(furnRotFromYaw(46)).toBe(1);
    for (const yaw of [0, 90, 180, 270]) {
      const rot = furnRotFromYaw(yaw);
      const [fx, fz] = FRONT[rot];
      const [lx, lz] = LOOK[yaw]!;
      expect([fx + 0, fz + 0], `yaw ${yaw}: 家具の 前は プレイヤーの ほう`).toEqual([0 - lx, 0 - lz].map((v) => v + 0));
    }
  });

  it('rightStep は プレイヤーの 右（北を 見ると 東・東を 見ると 南）', () => {
    expect(rightStep(0)).toEqual([1, 0]);
    expect(rightStep(1)).toEqual([0, 1]);
    expect(rightStep(2)).toEqual([-1, 0]);
    expect(rightStep(3)).toEqual([0, -1]);
  });

  it('1 マスは ねらった マス。2 マスは ねらった マスが 見た目の 左はし（右へ のびる）', () => {
    for (const yaw of [0, 90, 180, 270]) {
      const [rx, rz] = rightStep(furnRotFromYaw(yaw));
      const one = furnPlaceCells('chair', yaw, 10, 10);
      expect(one.cells.map((c) => [c.x, c.z])).toEqual([[10, 10]]);
      const two = furnPlaceCells('table', yaw, 10, 10);
      expect(two.cells.map((c) => `${c.x},${c.z}`).sort(), `table yaw ${yaw}`).toEqual([`10,10`, `${10 + rx},${10 + rz}`].sort());
      const bath = furnPlaceCells('ofuro', yaw, 10, 10);
      expect(bath.cells.map((c) => `${c.x},${c.z}`).sort()).toEqual([`10,10`, `${10 + rx},${10 + rz}`].sort());
    }
    // 北を 見て（yaw 0）テーブル: 東へ のびる
    expect(furnPlaceCells('table', 0, 10, 10).cells.map((c) => [c.x, c.z]).sort()).toEqual([[10, 10], [11, 10]]);
  });

  it('3 マスは ねらった マスが まん中（左右へ のびる）', () => {
    for (const yaw of [0, 90, 180, 270]) {
      const [rx, rz] = rightStep(furnRotFromYaw(yaw));
      const t = furnPlaceCells('long_table', yaw, 10, 10);
      expect(t.cells.map((c) => `${c.x},${c.z}`).sort(), `long_table yaw ${yaw}`).toEqual([`${10 - rx},${10 - rz}`, '10,10', `${10 + rx},${10 + rz}`].sort());
    }
  });

  it('置いた マスから 同じ 家具の ぜんぶの マスが わかる（ほる ときに 使う）', () => {
    for (const kind of FURN_BLOCK_KINDS) {
      for (const yaw of [0, 90, 180, 270]) {
        const placed = furnPlaceCells(kind, yaw, 20, 30).cells;
        const want = placed.map((c) => `${c.x},${c.z},${c.id}`).sort();
        for (const c of placed) {
          const got = furnSiblings(c.id, c.x, c.z).map((s) => `${s.x},${s.z},${s.id}`).sort();
          expect(got, `${kind} yaw ${yaw} ${c.id}`).toEqual(want);
        }
      }
    }
    expect(furnSiblings('stone', 1, 1)).toEqual([]);
  });
});

describe('ほると 手に 入る アイテム', () => {
  it('家の ブロックは 同じ id・戸は どの 半分・あけしめでも house_door・家具は しゅるい（向き・マスは 関係ない）', () => {
    for (const id of HOUSE_BLOCK_IDS) expect(houseDropOf(id)).toBe(id);
    for (const id of HOUSE_DOOR_PART_IDS) expect(houseDropOf(id)).toBe('house_door');
    for (const id of FURN_BLOCK_IDS) expect(houseDropOf(id), id).toBe(furnInfo(id)!.kind);
    expect(houseDropOf('stone')).toBeNull();
    expect(houseDropOf('air')).toBeNull();
  });
});
