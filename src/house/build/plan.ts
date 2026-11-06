// 建築の 手順（HOUSE-1C PR-2 #340。仕様 §4.5・決め 9）。せっけいず → 足場の マス・かべの マス・仕上げの マス（相対位置の 表）と、進みごとの 数。DOM・three・世界なし。
// 形は shape.ts（houseShape。PR-1 の buildNow と 同じ）から 作る。別の 所に 同じ 計算を 書かない。
import type { BlockId } from '../../contracts';
import { scaffoldIdAt } from '../../world/blocks/buildBlocks';
import type { Blueprint } from '../editor/blueprint';
import { ROOF_Y } from '../editor/tuning';
import { houseShape } from '../shape';
import { STAGE } from './tuning';

/** 外の 箱の 北西の すみ・床の 段から の ずれ */
export interface PlanCell {
  x: number;
  y: number;
  z: number;
  id: BlockId;
}

export interface BuildPlan {
  outerW: number;
  outerD: number;
  /** 足場（最初に ぜんぶ 立てる。完成で 消える） */
  scaffold: PlanCell[];
  /** かべ（窓・戸も）。うしろ・よこの かべを 下の 段から 先に、戸の ある 前（南）の かべを 最後に 少しずつ 立てる（前は 建築中も 中が 見える・戸の 前に 立つ 建築士さんの じゃまを しない） */
  walls: PlanCell[];
  /** 仕上げ: 床 → 家具・ちょうちん → 屋根 の 順 */
  finish: PlanCell[];
}

export type PlanBlueprint = Pick<Blueprint, 'w' | 'd' | 'windows' | 'furniture'>;

export function makePlan(bp: PlanBlueprint): BuildPlan {
  const shape = houseShape(bp);
  const ow = shape.outerW;
  const od = shape.outerD;
  const ring = (c: { x: number; z: number }): boolean => c.x === 0 || c.z === 0 || c.x === ow - 1 || c.z === od - 1;
  const walls: PlanCell[] = [];
  const floor: PlanCell[] = [];
  const inner: PlanCell[] = [];
  const roof: PlanCell[] = [];
  for (const c of shape.cells) {
    if (c.id === 'air') continue;
    if (c.y === 0) floor.push(c);
    else if (c.y === ROOF_Y) roof.push(c);
    else if (ring(c)) walls.push(c);
    else inner.push(c);
  }
  // 足場: 中がわの ふちを ぐるっと 3 段。戸の 前の 中がわの 1 列は あけておく。のぼりは 北西の すみの いちばん 上に 1 本
  const scaffold: PlanCell[] = [];
  for (let y = 1; y < ROOF_Y; y++) {
    for (let z = 1; z <= od - 2; z++) {
      for (let x = 1; x <= ow - 2; x++) {
        const edgeX = x === 1 || x === ow - 2;
        const edgeZ = z === 1 || z === od - 2;
        if (!edgeX && !edgeZ) continue;
        if (x === shape.door.x && z === od - 2) continue;
        const flag = x === 1 && z === 1 && y === ROOF_Y - 1;
        scaffold.push({ x, y, z, id: flag ? 'ashiba_flag' : scaffoldIdAt(y, edgeZ ? 'x' : 'z') });
      }
    }
  }
  // 前（南）の かべは あと（それぞれの 中では 下の 段から）
  const front = (c: PlanCell): boolean => c.z === od - 1;
  const ordered = [...walls.filter((c) => !front(c)), ...walls.filter(front)];
  return { outerW: ow, outerD: od, scaffold, walls: ordered, finish: [...floor, ...inner, ...roof] };
}

/** 進み elapsed/length での 立てた 数（かべ・仕上げ）。0〜15% は 0・0、15〜85% は かべだけ、85〜100% は かべ ぜんぶ ＋ 仕上げ。完成（elapsed ≧ length）は 呼ばない */
export function stageCounts(p: BuildPlan, elapsed: number, length: number): { walls: number; finish: number } {
  const t = length <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / length));
  const W = p.walls.length;
  const F = p.finish.length;
  if (t < STAGE.scaffoldEnd) return { walls: 0, finish: 0 };
  if (t < STAGE.wallEnd) return { walls: Math.floor(((t - STAGE.scaffoldEnd) / (STAGE.wallEnd - STAGE.scaffoldEnd)) * W), finish: 0 };
  return { walls: W, finish: Math.min(F, Math.floor(((t - STAGE.wallEnd) / (1 - STAGE.wallEnd)) * F)) };
}
