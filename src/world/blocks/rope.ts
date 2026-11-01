import type { BlockId } from '../../contracts';

/**
 * ROPE-1: ロープ（がけの ふちから 下へ たらす 物）。数と きまりは ここ 1 か所。
 * - 版 3: がけに むかって 立って 右クリック。足もとの マスに くい（rope_stake）、向いて いる ほう（4 方向）の となりの マスから 下へ たれる（planRopeHere）。
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
/** 版 3: ロープを まきつけた くい（ロープの いちばん 上。足もとの マス） */
export const ROPE_STAKE: BlockId = 'rope_stake';

/** ROPE-1 版 3: ロープの さく（1 マス。よこから とおれない・上に のれる・ジャンプで こえる） */
export const ROPE_FENCE: BlockId = 'rope_fence';
const ROPE_PARTS: ReadonlySet<string> = new Set([ROPE, ROPE_COIL, ROPE_STAKE, ROPE_FENCE]);

/** ロープの マス（たれた なわ・ロープだまり・くい）か */
export function isRopeBlock(id: string): boolean {
  return ROPE_PARTS.has(id);
}

/** つかまれる マス（たれた なわ・ロープだまり。くいは 足もと なので ちがう） */
export function isClimbBlock(id: string): boolean {
  return id === ROPE || id === ROPE_COIL;
}

/** 向き（yaw 度。0 = -z、90 = +x。PlayerController と 同じ）に いちばん 近い 4 方向の 1 マス [dx, dz] */
export function facingStep(yawDeg: number): readonly [number, number] {
  const r = (yawDeg * Math.PI) / 180;
  const sx = Math.sin(r);
  const sz = -Math.cos(r);
  return Math.abs(sx) >= Math.abs(sz) ? [Math.sign(sx), 0] : [0, Math.sign(sz)];
}

export interface RopeHerePlan extends RopePlan {
  /** くいの マス（足もと） */
  stake: { x: number; y: number; z: number };
  /** たれる 列の x・z */
  x: number;
  z: number;
}

/**
 * 版 3: 足もとから 向いて いる ほうへ たらす 計画。
 * - くい = 足もとの マス (fx, fy, fz)。canStake = あいて いて（くさは 上書き）、その 下が 固い（立って いる）こと。
 * - たれる 列 = 向いた ほうの となり (fx+dx, fz+dz)。fy と fy-1 の 両方が あいて いれば がけ（段差 1 以上）。
 * - その 列の fy から 下へ planRope（1 本 10 マス、床で ロープだまり）。
 * がけで ない・くいが おけない・0 本 なら null（何も へらない）
 */
export function planRopeHere(
  feet: { x: number; y: number; z: number },
  yawDeg: number,
  have: number,
  canStake: () => boolean,
  open: (x: number, y: number, z: number) => boolean,
  minY = 0,
): RopeHerePlan | null {
  if (have < 1 || !canStake()) return null;
  const [dx, dz] = facingStep(yawDeg);
  const x = feet.x + dx;
  const z = feet.z + dz;
  if (!open(x, feet.y - 1, z)) return null; // まえが 段差に なって いない
  const plan = planRope((y) => open(x, y, z), feet.y, have, minY);
  return plan ? { ...plan, stake: { ...feet }, x, z } : null;
}

/** くいの まわり 4 マスで、同じ 高さに たれた ロープの 上はしが ある 列（なければ null） */
export function stakeRope(id: (x: number, y: number, z: number) => string, x: number, y: number, z: number): { x: number; z: number } | null {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (isClimbBlock(id(x + dx, y, z + dz)) && !isClimbBlock(id(x + dx, y + 1, z + dz))) return { x: x + dx, z: z + dz };
  }
  return null;
}

/** ロープの 上はし (x, top, z) の まわりの くい（なければ null） */
export function ropeStakeOf(id: (x: number, y: number, z: number) => string, x: number, top: number, z: number): { x: number; z: number } | null {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (id(x + dx, top, z + dz) === ROPE_STAKE) return { x: x + dx, z: z + dz };
  return null;
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
  while (id(bottom) === ROPE && isClimbBlock(id(bottom - 1))) bottom--;
  return { top, bottom };
}
