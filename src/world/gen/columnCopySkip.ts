import { BLOCK_INDEX } from '../blocks/blockTypes';
import { COUNTRY_PLANT_IDS } from '../blocks/countryPlants';
import { featuresNearChunk } from './countryFeatureBlocks';
import { plantsInRect } from './placement';

/**
 * 「列の 写し」テスト（mineOres.test A4・mine1dSave.test D9）が くらべない 列の 判定（1 か所）。見本は 書きかえない（国だけの 物が 入る 前の 生成から 取った 物）。
 * 前の main との ブロックごとの くらべで、ちがいが 国だけの 物（VOX-I-4a・4b）の ブロックだけ だと 確かめた 列を のぞく:
 *   ・たけ（高さ 6〜10 に なった）・国だけの 草花（きのこ・ひまわり・かいがら・たけのこ）・山の 物の ブロック（おちば・すいしょう・とうろう）が ある 列
 *   ・国だけの 物（かいだん・おおもみじ・ゆきだるま など、目じるしの ブロックが ない 物）の ブロックが ある 列と、木・草花を どけた 四角の 中に 本当に 木・草花が あった 列
 */

/** 目じるしに なる ブロックの 番号 */
const MARKERS: ReadonlySet<number> = new Set([BLOCK_INDEX.bamboo, BLOCK_INDEX.ochiba, BLOCK_INDEX.suisho, BLOCK_INDEX.touro, ...COUNTRY_PLANT_IDS.map((b) => BLOCK_INDEX[b])]);

/** 列 (cx, cz) の ブロック（`blocks.some` で 1 つずつ 見られる）を 見て、くらべない 列か */
export function skipsColumnCopy(seed: number, cx: number, cz: number, blocks: { some(f: (v: number) => boolean): boolean }): boolean {
  if (blocks.some((v) => MARKERS.has(v))) return true;
  const x0 = cx * 16;
  const z0 = cz * 16;
  const f = featuresNearChunk(seed, x0, z0);
  // 木・草花を どけた 四角の 中に 本当に 木・草花が あった、または 物の ブロックが この 列の 中に ある
  const TREE = new Set(['tree', 'bigTree', 'matsu', 'momiji']);
  if (f.trees.some((r) => plantsInRect(seed, r[0], r[1], r[2], r[3]).some((p) => TREE.has(p.type)))) return true;
  if (f.plants.some((r) => plantsInRect(seed, Math.max(r[0], x0), Math.max(r[1], z0), Math.min(r[2], x0 + 15), Math.min(r[3], z0 + 15)).length > 0)) return true;
  return f.sites.some((s) => s.blocks.some((b) => b.x >= x0 && b.x < x0 + 16 && b.z >= z0 && b.z < z0 + 16));
}
