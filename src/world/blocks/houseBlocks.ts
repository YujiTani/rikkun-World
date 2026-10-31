/**
 * 家の ブロックと 向きの ある 家具（HOUSE-1C PR-1 #340。仕様 docs/design/HOUSE-1.md §2.13・§4.8）。このファイルは 何も import しない 葉。
 *
 * ・家の ブロック 5 つ（ゆか・かべ・やね・しょうじ・戸）。戸は 2 マス × あけ・しめ = 4 つの id（持ち物に 入るのは 下の しまった `house_door` だけ）
 * ・向きの ある 家具 10 しゅるい（たんす・かまど〔今の id は 向き 0〕と 新しい 8 つ）。向き rot（0 ＝ 前が 南 → 1 ＝ 西 → 2 ＝ 北 → 3 ＝ 東。上から 見て 時計まわり）ごとに 別の id
 *   （ふとん・チョークの しるしと 同じ 考え。列の 保存だけで のこる）。2〜3 マスの 家具は マスごとに 別の id（`table`〔左から 1 つ目〕・`table_2`〔2 つ目〕…）。
 *   id ＝ しゅるい ＋（2 つ目 以降は `_2`・`_3`）＋（向き 1〜3 は `_w`・`_n`・`_e`）。ブロックの 番号は 1 マス 1 バイト（256 まで）
 * ・「箱の 形の 左から k 番目」は 家具の 絵の 形（前 ＝ −z）での 順。置いた 向きで 世界の どの マスに なるかは `furnCellOffset`
 */

/** 家の ブロック 5 つ（持ち物に 入る。順番は ブロックの 番号と アイテムの 並び） */
export const HOUSE_BLOCK_IDS = ['house_floor', 'house_wall', 'house_roof', 'shoji', 'house_door'] as const;
export type HouseBlockId = (typeof HOUSE_BLOCK_IDS)[number];

/** 戸の ほかの 3 マス（上の 半分・あけた 下・あけた 上）。持ち物に 入らない（ほると `house_door` 1 こ） */
export const HOUSE_DOOR_PART_IDS = ['house_door_top', 'house_door_open', 'house_door_open_top'] as const;
export type HouseDoorPartId = (typeof HOUSE_DOOR_PART_IDS)[number];
type HouseDoorId = 'house_door' | HouseDoorPartId;

/** 戸の 4 つの id → どちらの 半分か・あいて いるか */
const DOOR_INFO: ReadonlyMap<string, { top: boolean; open: boolean }> = new Map<string, { top: boolean; open: boolean }>([
  ['house_door', { top: false, open: false }],
  ['house_door_top', { top: true, open: false }],
  ['house_door_open', { top: false, open: true }],
  ['house_door_open_top', { top: true, open: true }],
]);

export function doorInfo(id: string): { top: boolean; open: boolean } | null {
  return DOOR_INFO.get(id) ?? null;
}

/** 戸の id（下か 上・しめるか あけるか） */
export function doorId(top: boolean, open: boolean): HouseDoorId {
  if (top) return open ? 'house_door_open_top' : 'house_door_top';
  return open ? 'house_door_open' : 'house_door';
}

export type FurnRot = 0 | 1 | 2 | 3;

/** 向きのある 家具の しゅるいごとの 長さ（箱の 形の 左右の マスの 数。たては ぜんぶ 1） */
export const FURN_LEN = {
  tansu: 1,
  furnace: 1,
  chair: 1,
  shelf: 1,
  andon: 1,
  stool: 1,
  round_table: 1,
  table: 2,
  ofuro: 2,
  long_table: 3,
} as const;
export type FurnBlockKind = keyof typeof FURN_LEN;
export const FURN_BLOCK_KINDS = Object.keys(FURN_LEN) as readonly FurnBlockKind[];

/** 平らな 箱で 描く 家具（面ごとに 絵を かえる。ほかは 箱の 組み合わせ〔小物と 同じ 道〕） */
export type FlatFurnKind = 'tansu' | 'furnace';
export const FLAT_FURN_KINDS: ReadonlySet<FurnBlockKind> = new Set<FlatFurnKind>(['tansu', 'furnace']);

/** 向きごとの id の 末尾（rot 0〜3） */
const ROT_SUFFIX = ['', '_w', '_n', '_e'] as const;
type RotSuffix = (typeof ROT_SUFFIX)[number];
type CellIds<K extends FurnBlockKind> = (typeof FURN_LEN)[K] extends 1 ? K : (typeof FURN_LEN)[K] extends 2 ? K | `${K}_2` : K | `${K}_2` | `${K}_3`;
/** 向きのある 家具の ブロックの id 56 こ（たんす・かまどの 向き 0 は 今まで どおりの id） */
export type FurnBlockId = { [K in FurnBlockKind]: `${CellIds<K>}${RotSuffix}` }[FurnBlockKind];

export interface FurnInfo {
  kind: FurnBlockKind;
  rot: FurnRot;
  /** 箱の 形の 左から 何番目の マスか（0 から） */
  k: number;
}

const ROTS: readonly FurnRot[] = [0, 1, 2, 3];

/** 新しい 家の ブロック（戸の のこり・向きの ある 家具の 新しい id）が 持ち物に 入る とき 何に なるか（ほると 出る アイテムの id）。5 つの ブロックと 10 しゅるいの 家具 */
export type HouseBase = HouseBlockId | FurnBlockKind;

/** (しゅるい, マス k, 向き) → id */
export function furnBlockId(kind: FurnBlockKind, k: number, rot: FurnRot): FurnBlockId {
  return `${kind}${k > 0 ? `_${k + 1}` : ''}${ROT_SUFFIX[rot]}` as FurnBlockId;
}

const INFO = new Map<string, FurnInfo>();
/** 向きのある 家具の ブロックの id ぜんぶ（しゅるい → マス → 向き の 順。ブロックの 番号の 並び） */
export const FURN_BLOCK_IDS: readonly FurnBlockId[] = FURN_BLOCK_KINDS.flatMap((kind) =>
  Array.from({ length: FURN_LEN[kind] }, (_, k) => ROTS.map((rot) => furnBlockId(kind, k, rot))).flat(),
);
for (const kind of FURN_BLOCK_KINDS) {
  for (let k = 0; k < FURN_LEN[kind]; k++) for (const rot of ROTS) INFO.set(furnBlockId(kind, k, rot), { kind, rot, k });
}

/** 向き 0 の 1 つ目〔アイテムの id と 同じ〕 いがいの id（持ち物に 入らない。ほると 元の アイテム 1 こ） */
export type FurnVariantId = Exclude<FurnBlockId, FurnBlockKind>;
const KIND_IDS: ReadonlySet<string> = new Set<string>(FURN_BLOCK_KINDS);
export const FURN_VARIANT_IDS: readonly FurnVariantId[] = FURN_BLOCK_IDS.filter((id): id is FurnVariantId => !KIND_IDS.has(id));

/** 今ある id（番号を かえない）。これ いがいが 新しい ブロック */
const OLD_FURN_IDS: ReadonlySet<string> = new Set<string>(['tansu', 'furnace']);
export type NewFurnBlockId = Exclude<FurnBlockId, 'tansu' | 'furnace'>;
export const NEW_FURN_BLOCK_IDS: readonly NewFurnBlockId[] = FURN_BLOCK_IDS.filter((id): id is NewFurnBlockId => !OLD_FURN_IDS.has(id));

/** 呼び名（コードで id を 文字で 書かず ここから 読む。向きの ある 家具の しゅるい） */
export const K_TANSU = 'tansu' satisfies FurnBlockKind;
export const K_FURNACE = 'furnace' satisfies FurnBlockKind;

/** id が その しゅるいの 家具（どの 向きでも・どの マスでも）か */
export function isFurnKind(id: string, kind: FurnBlockKind): boolean {
  return INFO.get(id)?.kind === kind;
}

/** 向きのある 家具の ブロックなら しゅるい・向き・マス（そうでなければ null） */
export function furnInfo(id: string): FurnInfo | null {
  return INFO.get(id) ?? null;
}

/** 世界の 4 方向（上から 見て 時計まわりに 北から）。dx・dz */
const TURN_STEP: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** 家具の 全体の 大きさ（よこ, たて。マス）。w・d ＝ 向き 0 の 大きさ。向き 1・3 は 入れかわる（エディターの `footprint` も これを 呼ぶ） */
export function furnFootprint(w: number, d: number, rot: FurnRot): readonly [number, number] {
  return rot % 2 === 0 ? [w, d] : [d, w];
}

/**
 * 箱の 形の 左から k 番目の マスが、置いた 家具の 北西の すみの マスから どれだけ ずれた 場所に なるか（dx, dz）。
 * 箱の 形は 前が −z。向き 0 で 前が 南（+z）なので 180 度 まわす。向きが 1 つ ふえる ごとに 時計まわりに 90 度。
 */
export function furnCellOffset(len: number, rot: FurnRot, k: number): readonly [number, number] {
  let a = k + 0.5 - len / 2;
  let b = 0;
  const turns = (rot + 2) % 4;
  for (let i = 0; i < turns; i++) [a, b] = [-b, a];
  const [fw, fd] = furnFootprint(len, 1, rot);
  return [Math.round(fw / 2 + a - 0.5), Math.round(fd / 2 + b - 0.5)];
}

/** 家具 1 つの ぜんぶの マス（anchor ＝ 北西の すみ）とブロックの id */
export function furnCells(kind: FurnBlockKind, rot: FurnRot, ax: number, az: number): Array<{ x: number; z: number; id: FurnBlockId }> {
  const len = FURN_LEN[kind];
  return Array.from({ length: len }, (_, k) => {
    const [dx, dz] = furnCellOffset(len, rot, k);
    return { x: ax + dx, z: az + dz, id: furnBlockId(kind, k, rot) };
  });
}

/** 向き rot の とき、前から 見て 右（プレイヤーの 右）へ 進む 1 マスの ずれ。rot ＝ プレイヤーの yaw（0 ＝ 北を 見る）÷ 90 */
export function rightStep(rot: FurnRot): readonly [number, number] {
  return TURN_STEP[rot]!;
}

/** プレイヤーの yaw（度。0 ＝ 北 −z・90 ＝ 東 +x）→ 家具の 向き（前が プレイヤーの ほうを 向く） */
export function furnRotFromYaw(yawDeg: number): FurnRot {
  return ((((Math.round(yawDeg / 90) % 4) + 4) % 4) as FurnRot);
}

/**
 * ねらった マス (x, z) から 置く 家具の マスを きめる（プレイヤーの yaw から）。長さ 2 の 家具は ねらった マスが 見た目の 左はし（右へ のびる）、
 * 長さ 3 は ねらった マスが まん中（左右へ のびる）。1 マスは そのまま。
 */
export function furnPlaceCells(kind: FurnBlockKind, yawDeg: number, x: number, z: number): { rot: FurnRot; cells: Array<{ x: number; z: number; id: FurnBlockId }> } {
  const rot = furnRotFromYaw(yawDeg);
  const len = FURN_LEN[kind];
  const lead = Math.floor((len - 1) / 2);
  const [rx, rz] = rightStep(rot);
  const ax0 = x - rx * lead;
  const az0 = z - rz * lead;
  const ex = ax0 + rx * (len - 1);
  const ez = az0 + rz * (len - 1);
  return { rot, cells: furnCells(kind, rot, Math.min(ax0, ex), Math.min(az0, ez)) };
}

/** 置いた 家具の ある マス (x, z) の id から、同じ 家具の ぜんぶの マス（自分も ふくむ） */
export function furnSiblings(id: string, x: number, z: number): Array<{ x: number; z: number; id: FurnBlockId }> {
  const f = INFO.get(id);
  if (!f) return [];
  const len = FURN_LEN[f.kind];
  const [dx, dz] = furnCellOffset(len, f.rot, f.k);
  return furnCells(f.kind, f.rot, x - dx, z - dz);
}

/** 家の ブロック・家具の id から ほると 出る アイテムの id（戸は どちらの 半分・あけしめでも `house_door`。家具は しゅるい）。家のものでなければ null */
export function houseDropOf(id: string): HouseBase | null {
  if (DOOR_INFO.has(id)) return 'house_door';
  if ((HOUSE_BLOCK_IDS as readonly string[]).includes(id)) return id as HouseBlockId;
  return INFO.get(id)?.kind ?? null;
}
