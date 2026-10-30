/**
 * チョークの しるし（MINE-1B #349。仕様 docs/design/MINE-1.md §4.4「チョーク」）。
 *
 * しるしは 「どの 面に かいたか（face）」と「やじるしの 向き（dir）」を ブロックの id で もつ（ふとん futon.ts と 同じ 考え。列の 保存だけで のこる）。
 *   ・ゆか（固い ブロックの 上の 面）: face 'up'。dir は 北・東・南・西 の 4 つ
 *   ・かべ（固い ブロックの 横の 面）: face は かべの 外向きの 面（北を 向いた 面 ＝ 'n'。しるしは その 北がわの 空気の マスに ある）。
 *     dir は かべに そって 指す 向き（北・南向きの 面 ＝ 東か 西、東・西向きの 面 ＝ 北か 南）の 2 つ
 *   ・合わせて 4 + 4 × 2 = 12 こ。ブロックの 番号は 1 マス 1 バイト（256 まで）なので これ いじょうは ふやさない
 *
 * 向き（北 n = -z・東 e = +x・南 s = +z・西 w = -x）。
 * このファイルは 何も import しない 葉（contracts/world.ts の BlockId が 型だけ 読む）。
 */

export type Compass = 'n' | 'e' | 's' | 'w';
export type ChalkFace = 'up' | Compass;

/** しるしの id 12 こ（先頭の `chalk_mark` は ゆかの 北向き。名前は ぜんぶ 同じ「チョークの しるし」） */
export const CHALK_MARK_IDS = [
  'chalk_mark',
  'chalk_mark_up_e',
  'chalk_mark_up_s',
  'chalk_mark_up_w',
  'chalk_mark_n_e',
  'chalk_mark_n_w',
  'chalk_mark_s_e',
  'chalk_mark_s_w',
  'chalk_mark_e_n',
  'chalk_mark_e_s',
  'chalk_mark_w_n',
  'chalk_mark_w_s',
] as const;
export type ChalkMarkId = (typeof CHALK_MARK_IDS)[number];

export interface ChalkInfo {
  face: ChalkFace;
  dir: Compass;
}

/** id → (face, dir)。1 つの id に 1 行（足し忘れは 型エラー） */
const INFO = {
  chalk_mark: { face: 'up', dir: 'n' },
  chalk_mark_up_e: { face: 'up', dir: 'e' },
  chalk_mark_up_s: { face: 'up', dir: 's' },
  chalk_mark_up_w: { face: 'up', dir: 'w' },
  chalk_mark_n_e: { face: 'n', dir: 'e' },
  chalk_mark_n_w: { face: 'n', dir: 'w' },
  chalk_mark_s_e: { face: 's', dir: 'e' },
  chalk_mark_s_w: { face: 's', dir: 'w' },
  chalk_mark_e_n: { face: 'e', dir: 'n' },
  chalk_mark_e_s: { face: 'e', dir: 's' },
  chalk_mark_w_n: { face: 'w', dir: 'n' },
  chalk_mark_w_s: { face: 'w', dir: 's' },
} as const satisfies Record<ChalkMarkId, ChalkInfo>;

const ID_OF = new Map<string, ChalkMarkId>();
for (const id of CHALK_MARK_IDS) ID_OF.set(`${INFO[id].face}:${INFO[id].dir}`, id);

const IDS: ReadonlySet<string> = new Set(CHALK_MARK_IDS);

/** しるしの どれかか */
export function isChalkMarkId(id: string): id is ChalkMarkId {
  return IDS.has(id);
}

/** しるしの 面と 向き（しるしで なければ null）。返す 物は 共有の 定数なので 書きかえない */
export function chalkInfo(id: string): Readonly<ChalkInfo> | null {
  return isChalkMarkId(id) ? INFO[id] : null;
}

/** (面, 向き) の しるしの id。その 組みは ない（かべに そわない 向き）なら null */
export function chalkMarkId(face: ChalkFace, dir: Compass): ChalkMarkId | null {
  return ID_OF.get(`${face}:${dir}`) ?? null;
}

/** しるしを かける 面の 5 つ（ゆか・北・東・南・西） */
export const CHALK_FACES: readonly ChalkFace[] = ['up', 'n', 'e', 's', 'w'];

/** 面の 外向きの 向き（x, y, z）。ゆか ＝ 上 */
export const CHALK_NORMAL: Readonly<Record<ChalkFace, readonly [number, number, number]>> = {
  up: [0, 1, 0],
  n: [0, 0, -1],
  e: [1, 0, 0],
  s: [0, 0, 1],
  w: [-1, 0, 0],
};

/** 方位の 水平の 向き（x, z）。北 = -z・東 = +x */
export const COMPASS_STEP: Readonly<Record<Compass, readonly [number, number]>> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

/** 面の 外向きの 向きから 面を 決める（ゆか・かべの 4 方向 以外は null） */
export function chalkFaceOfNormal(nx: number, ny: number, nz: number): ChalkFace | null {
  if (ny === 1 && nx === 0 && nz === 0) return 'up';
  if (ny !== 0) return null;
  if (nx === 0 && nz === -1) return 'n';
  if (nx === 1 && nz === 0) return 'e';
  if (nx === 0 && nz === 1) return 's';
  if (nx === -1 && nz === 0) return 'w';
  return null;
}

/** かべに そって 進める 向き 2 つ（face が 'n' か 's' なら 東と 西、'e' か 'w' なら 北と 南）。ゆかは null */
export function chalkAlongWall(face: ChalkFace): readonly [Compass, Compass] | null {
  if (face === 'up') return null;
  return face === 'n' || face === 's' ? ['e', 'w'] : ['n', 's'];
}
