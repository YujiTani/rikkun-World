import type { BlockId } from '../../contracts';

/**
 * ROPE-1: ロープ（がけの ふちから 下へ たらす 物）。数と きまりは ここ 1 か所。
 * - ブロックの よこの 面（または 下の 面）を ねらって 使うと、その となりの マスから 下へ たれる（上の 面には 使えない）。
 * - 1 本で 10 マスまで。持って いる 数 N 本で 10 × N マスまで。つかう 本数は ⌈長さ ÷ 10⌉（持って いる 数が 上限）。
 * - 10 × N マス 以内で 床に とどいたら、いちばん 下の マスは ロープだまり（rope_coil）。
 * - どの マスを こわしても たれた ロープ ぜんぶが 消え、つかった 本数が 持ち物に もどる。
 */
export const ROPE_TUNING = {
  /** 1 本で たれる 長さ（マス） */
  perRope: 10,
  /** のぼる・おりる 速さ（マス/秒） */
  climbSpeed: 3,
} as const;

export const ROPE: BlockId = 'rope';
export const ROPE_COIL: BlockId = 'rope_coil';

/** ロープの マス（たれた なわ・ロープだまり）か */
export function isRopeBlock(id: string): boolean {
  return id === ROPE || id === ROPE_COIL;
}

/** たらせる マス（あき・水）か */
type CellOpen = (y: number) => boolean;

export interface RopePlan {
  /** 上から 下へ 並んだ マスの y と ブロック */
  cells: Array<{ y: number; block: BlockId }>;
  /** つかう 本数 */
  used: number;
}

/**
 * (x, top, z) から 下へ たらす 計画。open(y) = その 高さの マスが あいて いるか。
 * have = 持って いる 本数（1 以上）。top が あいて いなければ null
 */
export function planRope(open: CellOpen, top: number, have: number, minY = 0): RopePlan | null {
  if (have < 1 || !open(top)) return null;
  const max = ROPE_TUNING.perRope * have;
  const cells: RopePlan['cells'] = [];
  let y = top;
  while (cells.length < max && y >= minY && open(y)) {
    cells.push({ y, block: ROPE });
    y--;
  }
  // 床（あいて いない マス）に とどいた: いちばん 下は ロープだまり
  const landed = y >= minY && !open(y);
  if (landed) cells[cells.length - 1].block = ROPE_COIL;
  return { cells, used: ropesFor(cells.length) };
}

/** 長さ（マス）に いる 本数 */
export function ropesFor(len: number): number {
  return Math.ceil(len / ROPE_TUNING.perRope);
}

/** (x, y, z) を ふくむ たてに つながった ロープの 上はしと 下はし（id(y) = その 高さの ブロック） */
export function ropeColumn(id: (y: number) => string, y: number): { top: number; bottom: number } {
  let top = y;
  let bottom = y;
  while (id(top + 1) === ROPE) top++;
  // ロープだまりは いちばん 下にしか ない
  while (id(bottom) === ROPE && isRopeBlock(id(bottom - 1))) bottom--;
  return { top, bottom };
}
