import type { BlockId, VoxelWorld } from '../contracts';
import { isChalkMarkId } from './blocks/chalkMark';
import { isWater } from './blocks/water';

/**
 * 置き物（何マス も ある とりごや・こたつ）を 置く とき の「たいら に する」計算（LIVE-2.1 §2.1）。
 * 世界 は 読む だけ。変える マス の 一覧 `edits` を 返す ので、置く 側 が `applyFlatten` で 一度 に 書く。
 * これから 何マス も ある 置き物 を 足す とき も `planFlatten` を 使う（オーナー「こういう オブジェクト系 は 全て」）。
 */
export type FlattenWorld = Pick<VoxelWorld, 'size' | 'isLoaded' | 'getBlock' | 'isSolid'>;

/** 設定 `placeStepMax` の 初期値（けずる・うめる 高さ の 上限） */
export const PLACE_STEP_MAX = 2;
/** つぶ（土けむり）の 上限 */
export const FLATTEN_DUST_MAX = 25;

/** 消える（地面・草木）。16 種 */
const GROUND: readonly BlockId[] = ['grass', 'dirt', 'stone', 'sand', 'snow', 'coal_ore', 'iron_ore'];
const LEAVES: readonly BlockId[] = ['leaves', 'momiji_leaves', 'matsu_leaves'];
const FLORA: readonly BlockId[] = ['flower_y', 'flower_o', 'flower_p', 'susuki', 'kusa', 'nobana'];
export const FLATTEN_CLEAR: ReadonlySet<string> = new Set<string>([...GROUND, ...LEAVES, ...FLORA]);
const GROUND_SET: ReadonlySet<string> = new Set<string>(GROUND);

/** たいらに する とき 消して よい ブロックか（FLATTEN_CLEAR ＋ チョークの しるし 12 こ。しるしは 草と 同じ あつかい。MINE-1B） */
function clearable(id: string): boolean {
  return FLATTEN_CLEAR.has(id) || isChalkMarkId(id);
}

/** ほか の 置き物 の ブロック（ここ は じゃま・この 上 は 床 に できない） */
function isObjectBlock(id: string): boolean {
  return id.startsWith('toriya_') || id === 'nukunuku' || id.startsWith('nukunuku_');
}

export interface FlattenSpec {
  /** 足もと の いちばん 小さい x・z */
  x0: number;
  z0: number;
  /** 足もと の 広さ（x 方向 w・z 方向 d） */
  w: number;
  d: number;
  /** 床 の 高さ y（置き物 は y〜y+h-1） */
  y: number;
  /** 置き物 の 高さ H */
  h: number;
  /** けずる・うめる 上限（なければ 2） */
  stepMax?: number;
}

export interface FlattenEdit {
  x: number;
  y: number;
  z: number;
  block: 'air' | 'dirt' | 'grass';
}

export interface FlattenPlan {
  /** 変える マス（消す = air、うめる = dirt／いちばん 上 は grass） */
  edits: FlattenEdit[];
  /** 消える マス の 数 */
  cleared: number;
  /** うめる マス の 数 */
  filled: number;
  /** 土けむり を 出す 列（1 列 に 1 つ・25 まで。y は 床 の 高さ） */
  dust: Array<{ x: number; y: number; z: number }>;
  /** 見る マス の 数（性能 の 基準 ＝ 足もと × (H + 3)） */
  looked: number;
  /** すけた 形 と いっしょ に 出す「たいら に なる 足もと の 板」 */
  plate: { x0: number; z0: number; w: number; d: number; y: number };
}

/** 置けるなら 計画、だめ なら null。世界 は 変えない */
export function planFlatten(world: FlattenWorld, s: FlattenSpec): FlattenPlan | null {
  const step = s.stepMax ?? PLACE_STEP_MAX;
  const { y, h } = s;
  if (y < 1 || y + h > world.size.y) return null;
  const plan: FlattenPlan = {
    edits: [],
    cleared: 0,
    filled: 0,
    dust: [],
    looked: s.w * s.d * (h + 3),
    plate: { x0: s.x0, z0: s.z0, w: s.w, d: s.d, y },
  };
  for (let ix = s.x0; ix < s.x0 + s.w; ix++) {
    for (let iz = s.z0; iz < s.z0 + s.d; iz++) {
      if (!world.isLoaded(ix, iz)) return null;
      let touched = false;
      // 1・2. うえ を あける（段差 stepMax を こえる 地面 は だめ）
      for (let dy = 0; dy < h; dy++) {
        const b = String(world.getBlock(ix, y + dy, iz));
        if (b === 'air') continue;
        if (!clearable(b)) return null; // じゃま
        if (dy >= step && GROUND_SET.has(b)) return null;
        plan.edits.push({ x: ix, y: y + dy, z: iz, block: 'air' });
        plan.cleared++;
        touched = true;
      }
      // 3. うめる（y-1・y-2 まで。床 に する 固い ブロック が 置き物 の ブロック なら だめ）
      if (isObjectBlock(String(world.getBlock(ix, y - 1, iz)))) return null;
      let floorY = y - 1;
      while (floorY >= y - 1 - step && floorY >= 0 && !world.isSolid(ix, floorY, iz)) floorY--;
      if (floorY < y - 1 - step || floorY < 0) return null; // 深い あな・がけ
      if (isObjectBlock(String(world.getBlock(ix, floorY, iz)))) return null;
      for (let fy = floorY + 1; fy <= y - 1; fy++) {
        const fb = String(world.getBlock(ix, fy, iz));
        if (fb !== 'air' && !isWater(fb) && !clearable(fb)) return null; // たいまつ・作物 など を 土で つぶさない
        plan.edits.push({ x: ix, y: fy, z: iz, block: fy === y - 1 ? 'grass' : 'dirt' });
        plan.filled++;
        touched = true;
      }
      if (touched && plan.dust.length < FLATTEN_DUST_MAX) plan.dust.push({ x: ix, y, z: iz });
    }
  }
  return plan;
}

/** 計画 の とおり に 書く（一度 に）。`set` は 世界 の `setBlock` */
export function applyFlatten(plan: FlattenPlan, set: (x: number, y: number, z: number, block: BlockId) => unknown): void {
  for (const e of plan.edits) set(e.x, e.y, e.z, e.block);
}

/** 体 の 箱（足もと の まん中 x・z、足 の y、はば、高さ）が、置き物 の マス か うめる マス に 重なる か */
export function bodyHitsCells(
  body: { x: number; y: number; z: number; w: number; h: number },
  cells: ReadonlyArray<{ x: number; y: number; z: number }>,
): boolean {
  const hw = body.w / 2;
  for (const c of cells) {
    if (c.x < body.x + hw && c.x + 1 > body.x - hw && c.y < body.y + body.h && c.y + 1 > body.y && c.z < body.z + hw && c.z + 1 > body.z - hw) return true;
  }
  return false;
}
