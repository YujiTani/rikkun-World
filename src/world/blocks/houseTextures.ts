/**
 * 家の ブロックと 家具の 絵（HOUSE-1C PR-1 #340）を 世界の 絵の 表（textures.ts の TILE_NAMES）に 足す 名前と 描き方。
 * ・家の ブロック 12 まい（houseArt.ts）…… 名前は そのまま（`house_wall` など）
 * ・家具の 絵 20 まい（furnitureArt.ts）…… 名前は `furn_` を 前に つける（`furn_wood_top` など。ふつうの ブロックの 絵と 名前が ぶつからない ように）
 * エディターの 見本も 同じ 表を 読む（見本の ための 写しの 表は 持たない）。ブロックの 絵と 同じ 名前の ときは そちらを 使う（`tileOf`）。
 */
import type { BlockId } from '../../contracts';
import { BUILD_TILE_NAMES, buildTiles, type BuildTile } from './buildArt';
import { KATAME_TSUCHI, SCAFFOLD_IDS } from './buildBlocks';
import { FURN_TILE_NAMES, furnTiles, type FurnTile } from './furnitureArt';
import { HOUSE_TILE_NAMES, houseTiles, type HouseTile } from './houseArt';
import { FURN_BLOCK_IDS, FLAT_FURN_KINDS, furnBlockId, furnInfo, type FlatFurnKind, type FurnBlockKind, type FurnRot } from './houseBlocks';
import type { Px } from './houseTilePaint';
import type { TileName } from './textures';

type FurnAtlasTile = `furn_${FurnTile}`;
export type HouseAtlasTile = HouseTile | FurnAtlasTile | BuildTile;

/** 世界の 絵の 表に 足す 名前（家の ブロック 12 → 家具 20 → 建築の ブロック 8 の 順。PR-2 の 8 まいは さいごに 足した） */
export const HOUSE_ATLAS_TILE_NAMES: readonly HouseAtlasTile[] = [...HOUSE_TILE_NAMES, ...FURN_TILE_NAMES.map((n): FurnAtlasTile => `furn_${n}`), ...BUILD_TILE_NAMES];
const HOUSE_SET: ReadonlySet<string> = new Set<string>(HOUSE_ATLAS_TILE_NAMES);

export function isHouseTile(name: string): name is HouseAtlasTile {
  return HOUSE_SET.has(name);
}

let painted: Record<string, Px> | null = null;

/** 絵 1 まい（0xRRGGBB の 列。上の 行から）。初めに 40 まい まとめて 描いて おぼえる */
export function paintHouseTile(name: HouseAtlasTile): Px {
  if (!painted) {
    painted = { ...houseTiles() };
    const furn = furnTiles();
    for (const n of FURN_TILE_NAMES) painted[`furn_${n}`] = furn[n];
    Object.assign(painted, buildTiles());
  }
  return painted[name]!;
}

/** 家具の 箱の 表に 書いた 絵の 名前（`wood_top` など。ふつうの ブロックの 絵の 名前も 混ざる）→ 世界の 絵の 表の 名前 */
export function furnTileName(name: string): string {
  const furn = `furn_${name}`;
  return HOUSE_SET.has(furn) ? furn : name;
}

// ---------------------------------------------------------------- ブロックの 面の 絵

type Tiles3 = readonly [TileName, TileName, TileName];
/** 平らな 箱の 家の ブロックの [上, 下, 横]。ゆか ＝ 石だたみ（下と 横は 板の ふち）・かべ ＝ ふとい 板（上と 下は こい 板）・やね ＝ 板と 石（下 ＝ 天井） */
const FLAT_HOUSE_TILES: Readonly<Partial<Record<BlockId, Tiles3>>> = {
  house_floor: ['house_floor', 'house_floor_side', 'house_floor_side'],
  house_wall: ['house_wall_top', 'house_wall_top', 'house_wall'],
  house_roof: ['house_roof_top', 'house_ceiling', 'house_roof_side'],
};

/** 戸の 4 つの マス（下・上 × しめ・あけ）の 絵。ブロックの 絵の 表の きまりで 3 つ ならべる（描くのは render/houseProp.ts） */
const DOOR_TILES: Readonly<Partial<Record<BlockId, Tiles3>>> = {
  house_door: ['house_door_lo', 'house_door_lo', 'house_door_lo'],
  house_door_open: ['house_door_lo', 'house_door_lo', 'house_door_lo'],
  house_door_top: ['house_door_hi', 'house_door_hi', 'house_door_hi'],
  house_door_open_top: ['house_door_hi', 'house_door_hi', 'house_door_hi'],
};

/** 箱の 組み合わせで 描く 家具（向きごと・マスごとの id すべて）の [上, 下, 横]。ふだんは 使わない 代表の 絵（アイコンは 別。ブロックの 表は 3 つ そろう きまり） */
const PROP_FURN_TILES: Readonly<Record<Exclude<FurnBlockKind, FlatFurnKind>, Tiles3>> = {
  chair: ['furn_zabuton', 'furn_wood_top', 'furn_wood_side'],
  stool: ['furn_zabuton', 'furn_wood_top', 'furn_wood_side'],
  table: ['furn_wood_top', 'furn_wood_top', 'furn_wood_side'],
  long_table: ['furn_wood_top', 'furn_wood_top', 'furn_wood_side'],
  round_table: ['furn_wood_top', 'furn_wood_top', 'furn_wood_side'],
  shelf: ['furn_wood_top', 'furn_wood_top', 'furn_wood_v'],
  andon: ['furn_andon_top', 'furn_wood_top', 'furn_shoji'],
  ofuro: ['furn_wood_top', 'furn_wood_top', 'furn_bath_side'],
};

/**
 * 面ごとに 絵を かえる 平らな 箱（たんす・かまど。向きごとの id）の 6 面の 絵: [上, 下, +x, −x, +z, −z]（FACES の index と 同じ 並び）。
 * 向き rot の とき 前は 南〔+z〕→ 西 → 北 → 東。前 ＝ ゲームの ブロックの 絵・うしろ ＝ うしろの 絵・左右 ＝ よこの 絵
 */
const FRONT_FACE: Readonly<Record<FurnRot, number>> = { 0: 4, 1: 3, 2: 5, 3: 2 };
const FLAT_ART = {
  tansu: { top: 'tansu_top', front: 'tansu_front', flank: 'furn_tansu_flank', rear: 'furn_tansu_rear' },
  furnace: { top: 'furnace_top', front: 'furnace_side', flank: 'furn_furnace_flank', rear: 'furn_furnace_rear' },
} as const satisfies Record<FlatFurnKind, { top: TileName; front: TileName; flank: TileName; rear: TileName }>;

export const FURN_FACE_TILES: Readonly<Record<string, readonly TileName[]>> = Object.fromEntries(
  (Object.keys(FLAT_ART) as FlatFurnKind[]).flatMap((kind) =>
    ([0, 1, 2, 3] as const).map((rot) => {
      const a = FLAT_ART[kind];
      const front = FRONT_FACE[rot];
      const faces: TileName[] = [a.top, a.top, a.flank, a.flank, a.flank, a.flank];
      faces[front] = a.front;
      faces[front % 2 === 0 ? front + 1 : front - 1] = a.rear; // 前の 反対がわ（2↔3・4↔5）
      return [furnBlockId(kind, 0, rot), faces] as const;
    }),
  ),
);

/** 建築の ブロックの [上, 下, 横]: かためた つち（はんこの ます目）と 足場（箱の 組み合わせ。描くのは render/houseProp.ts。ここの 3 つは 代表の 絵） */
const BUILD_BLOCK_TILES: Readonly<Partial<Record<BlockId, Tiles3>>> = {
  [KATAME_TSUCHI]: ['h1_soil_top', 'h1_soil_side', 'h1_soil_side'],
  ...Object.fromEntries(SCAFFOLD_IDS.map((id) => [id, ['h1_plank', 'h1_plank_end', 'h1_pole'] as Tiles3])),
};

/** 家の ブロックの [上, 下, 横]（ゆか・かべ・やね）と 向きごとの たんす・かまどの [上, 下, 前]（面ごとの 絵は FURN_FACE_TILES）。textures.ts の BLOCK_TILES に 足す */
export const HOUSE_BLOCK_TILES: Readonly<Partial<Record<BlockId, Tiles3>>> = {
  ...FLAT_HOUSE_TILES,
  ...BUILD_BLOCK_TILES,
  shoji: ['house_shoji', 'house_shoji', 'house_shoji'],
  ...DOOR_TILES,
  ...Object.fromEntries(FURN_BLOCK_IDS.flatMap((id) => { const k = furnInfo(id)!.kind; return FLAT_FURN_KINDS.has(k) ? [] : [[id, PROP_FURN_TILES[k as keyof typeof PROP_FURN_TILES]] as const]; })),
  ...Object.fromEntries(Object.entries(FURN_FACE_TILES).map(([id, f]) => [id, [f[0], f[1], f[FRONT_FACE[0]]] as const])),
};
