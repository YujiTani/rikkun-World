import type { BowEvent, Vec3, VoxelWorld, YokaiInfo, YokaiKnock, YokaiWorld } from '../../contracts';
import { LEGEND4_TUNING } from '../../content/items/legend4Tuning';
import { raycastBlocks } from '../../dig/raycast';
import { createRng, type Rng } from '../../world/gen/random';

/**
 * LEGEND-4 PR2 八咫烏（docs/design/LEGEND-4.md §5.3）: 当たった 点の ほのお と 「矢が へらない」くじ。three なし・BowSystem から 呼ばれる。
 * ほのおは 半径 `burstRadius` の 球の 中に 体の まん中が ある 妖怪で、点から まん中への 線が 固い ブロックに さえぎられない 体 ぜんぶ。
 * ブロックは こわさない・かえない。プレイヤー・仲間・どうぶつは 妖怪の 世界に いないので 当たらない。
 */
const Y = LEGEND4_TUNING.yatagarasu;
/** 体の まん中の 高さ（足もとから。妖怪の 大きさ `scale` を かける） */
const BODY_CENTER = Y.bodyCenter;
/** ブロックに 当たった ときの 点から 矢の 向きの うしろへ もどす きょり（マス。点が 面の 上だと 自分の ブロックに さえぎられる ため） */
export const BURST_BACKOFF = Y.burstBackoff;

/** 人ごとの くじの 乱数（シード付き。ほかの 乱数の 列と 混ぜない）。`who` = 1P か 2P */
export function createSaveRoll(who: 1 | 2): Rng {
  return createRng(Y.saveSeed + who * 0x101);
}

/** くじの 値が この 数より 小さければ 矢は へらない */
export function arrowSaved(roll: number): boolean {
  return roll < Y.saveChance;
}

const center: Vec3 = { x: 0, y: 0, z: 0 };

/** 体の まん中（使いまわす入れ物に 書いて 返す。次の 呼び出しまで 有効） */
function centerOf(y: YokaiInfo): Vec3 {
  center.x = y.position.x;
  center.y = y.position.y + BODY_CENTER * (y.scale || 1);
  center.z = y.position.z;
  return center;
}

/** 毎回 使いまわす 入れ物（new しない） */
const hitsBuf: { id: number; damage: number }[] = [];
const burstKnock: YokaiKnock = { dist: Y.burstKnock[0], up: Y.burstKnock[1] };

/**
 * ほのおを 1 回 はじけさせる。`at` = 当たった 点、`seeFrom` = さえぎりを 見る 線の 始まり（ブロックに 当たった ときは 少し もどした 点）、
 * `directId` = 矢が 直接 当たった 妖怪（必ず ほのおも 当たる。なければ -1）。ダメージを 与えて イベントを 返す
 */
export function fireBurst(world: VoxelWorld, yokai: YokaiWorld, at: Vec3, seeFrom: Vec3, directId: number, tick: number): BowEvent {
  hitsBuf.length = 0;
  const list = yokai.list();
  const r2 = Y.burstRadius * Y.burstRadius;
  for (let i = 0; i < list.length; i++) {
    const y = list[i]!;
    const direct = y.id === directId;
    if (!direct) {
      if (y.hp <= 0) continue;
      const c = centerOf(y);
      const dx = c.x - at.x;
      const dy = c.y - at.y;
      const dz = c.z - at.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2);
      if (d > 1e-6) {
        const sx = c.x - seeFrom.x;
        const sy = c.y - seeFrom.y;
        const sz = c.z - seeFrom.z;
        const sl = Math.hypot(sx, sy, sz);
        if (sl > 1e-6 && raycastBlocks(world, seeFrom.x, seeFrom.y, seeFrom.z, sx / sl, sy / sl, sz / sl, sl, true) !== null) continue;
      }
    }
    hitsBuf.push({ id: y.id, damage: Y.burstDamage });
  }
  const hits: { id: number; damage: number }[] = [];
  for (const h of hitsBuf) {
    yokai.damage(h.id, h.damage, at, burstKnock);
    hits.push({ id: h.id, damage: h.damage });
  }
  return { type: 'yataBurst', tick, position: { x: at.x, y: at.y, z: at.z }, hits };
}
