import type { BlockId, DigEvent, Inventory, LockStatus, PlayerState, TargetInfo, Vec3, VoxelWorld } from '../contracts';
import type { PunchGate } from '../combat/PlayerCombat';
import { isChalkMarkId } from '../world/blocks/chalkMark';
import { BODY_H, BODY_W, type DigConfig } from './config';
import type { DigM4Deps } from './digPorts';

/**
 * DigSystem の「係」（こわす・置く・畑・にわとり・攻撃の向き）が共通で使う口。
 * DigSystemImpl が自分の持ち物から 1 回だけ作って渡す（`this` ごとは渡さない）。
 */
export interface DigCore {
  readonly world: VoxelWorld;
  readonly inventory: Inventory;
  readonly m4: DigM4Deps;
  readonly config: DigConfig;
  readonly lock: LockStatus;
  readonly gate: PunchGate | null;
  player(): PlayerState;
  /** いまのねらい（ステップごとに決め直す） */
  tgt(): TargetInfo | null;
  /** ねらいが 体の 上の マス（#293）か */
  bodyTgt(): boolean;
  /** この係の 歩数 */
  tick(): number;
  emit(e: DigEvent): void;
}

/** LIVE-2: 小屋 の ブロック（持ち物 に 入らない。こわすと 小屋 ぜんぶ が 消えて `toriya` 1） */
export const COOP_BLOCKS: ReadonlySet<BlockId> = new Set<BlockId>(['toriya_fence', 'toriya_gate', 'toriya_nest', 'toriya_box']);

/** 置くと その マスの 物が きえて 置ける もの（くさ・チョークの しるし。ねらうと その マスに 置く） */
export function isReplaceable(id: string): boolean {
  return id === 'kusa' || isChalkMarkId(id);
}

export const TORCH_NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
  [0, -1, 0], // ちょうちん（ITEM-FX-1）は 上（天井）でも ささえられる
];

export function center(b: Vec3): Vec3 {
  return { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 };
}

export function sameBlock(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export function torchSupported(w: VoxelWorld, x: number, y: number, z: number): boolean {
  return w.isSolid(x, y - 1, z) || w.isSolid(x - 1, y, z) || w.isSolid(x + 1, y, z) || w.isSolid(x, y, z - 1) || w.isSolid(x, y, z + 1);
}

/** ちょうちん（ITEM-FX-1）: たいまつの 支え ＋ 上（天井）の 固い ブロック。下・横・上の どれかが 固ければ 置ける */
export function lanternSupported(w: VoxelWorld, x: number, y: number, z: number): boolean {
  return torchSupported(w, x, y, z) || w.isSolid(x, y + 1, z);
}

/** 支えが 要る ブロック（たいまつ・ちょうちん）の 「ささえられて いるか」の 判定（置く・支えを こわして おとす 両方が 読む） */
export const HANGING_SUPPORT: Partial<Record<BlockId, (w: VoxelWorld, x: number, y: number, z: number) => boolean>> = {
  torch: torchSupported,
  lantern: lanternSupported,
};

/** ブロック (bx, by, bz) が プレイヤーの 体(足もと p)と 重なるか */
export function overlapsBody(p: Vec3, bx: number, by: number, bz: number): boolean {
  const h = BODY_W / 2;
  return bx < p.x + h && bx + 1 > p.x - h && by < p.y + BODY_H && by + 1 > p.y && bz < p.z + h && bz + 1 > p.z - h;
}
