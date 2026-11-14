/**
 * #293 試作: たたきつけた 手の 下と まわりの ブロックを こわす（yuzu 2026-10-24「塗り壁のように フィールドを 破壊する」）。
 * こわして よい ブロックの きまりは ぬりかべの たおれこみ（src/yokai/ai/YokaiManager.ts の crush）と おなじ:
 *   いちばん 下の 段（y ≦ 0。岩盤の かわり）・air・outside・みず・start_torch・家の 戸〔上・下・あけた 物も〕は こわさない。落とし物は なし。
 *   こわした マスは onBlocks へ（ぬりかべと おなじく くだける つぶと 音は 呼ぶ 側）。
 * 数は gashaBigTuning.ts の slam.crush*。
 */
import { canCrushBlock, crushPartner } from '../world/blocks/crushable';
import { TUNE as T } from './gashaBigTuning';

export interface CrushIO {
  /** ブロックの 名前 */
  getBlock(x: number, y: number, z: number): string;
  /** 空気に する（できたら true） */
  setAir(x: number, y: number, z: number): boolean;
  /** TOWN-1 1.4 AC9: true の マスは こわさない（街の keeps〔あきち・石段・はしの 石がき〕。なければ ぜんぶ こわせる） */
  protect?(x: number, y: number, z: number): boolean;
  /** こわした マス（ぬりかべの onBlocks と おなじ 形） */
  onBlocks?(cells: { x: number; y: number; z: number; from: string; to: 'air' }[]): void;
}

/** ぬりかべと おなじ きまり〔canCrushBlock。宝箱も よける〕: こわして よい ブロックか */
export function crushable(block: string, y: number): boolean {
  return y > 0 && canCrushBlock(block);
}

/** 手の ひらの まんなか（x, z）と 立つ 面の 高さ y の まわりを こわす。こわした マスを 返す。S を 省くと 前進の たたきつけ（slam）、両手たたきつけは T.slam2 */
export function crushAt(x: number, y: number, z: number, io: CrushIO, S: { crushRadius: number; crushDepth: number; crushUp: number } = T.slam): { x: number; y: number; z: number; from: string; to: 'air' }[] {
  const R = Math.max(0, S.crushRadius);
  const changed: { x: number; y: number; z: number; from: string; to: 'air' }[] = [];
  if (R <= 0) return changed;
  const y0 = Math.floor(y + 1e-6);
  const lo = y0 - Math.max(0, Math.round(S.crushDepth)), hi = y0 + Math.max(0, Math.round(S.crushUp)) - 1;
  for (let i = Math.floor(x - R); i <= Math.floor(x + R); i++) {
    for (let k = Math.floor(z - R); k <= Math.floor(z + R); k++) {
      if (Math.hypot(i + 0.5 - x, k + 0.5 - z) > R) continue;
      for (let j = lo; j <= hi; j++) {
        const b = io.getBlock(i, j, k);
        if (!crushable(b, j) || io.protect?.(i, j, k)) continue;
        if (io.setAir(i, j, k)) changed.push({ x: i, y: j, z: k, from: b, to: 'air' });
        const pr = crushPartner(b, i, j, k); // ひまわりの 相手の 段
        if (pr) {
          const pb = io.getBlock(pr.x, pr.y, pr.z);
          if (crushable(pb, pr.y) && !io.protect?.(pr.x, pr.y, pr.z) && io.setAir(pr.x, pr.y, pr.z)) changed.push({ x: pr.x, y: pr.y, z: pr.z, from: pb, to: 'air' });
        }
      }
    }
  }
  if (changed.length > 0) io.onBlocks?.(changed);
  return changed;
}
