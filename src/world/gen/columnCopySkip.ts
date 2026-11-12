import { BLOCK_INDEX } from '../blocks/blockTypes';
import { COUNTRY_PLANT_IDS } from '../blocks/countryPlants';
import { featuresNearChunk } from './countryFeatureBlocks';

/**
 * 「列の 写し」テスト（mineOres.test A4・mine1dSave.test D9）が くらべない 列の 判定（1 か所）。見本は 書きかえない（国だけの 物が 入る 前の 生成から 取った 物）。
 * 前の main との ブロックごとの くらべで、ちがいが 国だけの 物（VOX-I-4a・4b）の ブロックだけ だと 確かめた 列を のぞく:
 *   ・たけ（高さ 6〜10 に なった）・国だけの 草花（きのこ・ひまわり・かいがら・たけのこ）・山の 物の ブロック（おちば・すいしょう・とうろう）が ある 列
 *   ・国だけの 物（かいだん・おおもみじ・ゆきだるま など、目じるしの ブロックが ない 物）の 足もとの まわり（木を どける 四角まで）に かかる 列
 */

/** 目じるしに なる ブロックの 番号 */
const MARKERS: ReadonlySet<number> = new Set([BLOCK_INDEX.bamboo, BLOCK_INDEX.ochiba, BLOCK_INDEX.suisho, BLOCK_INDEX.touro, ...COUNTRY_PLANT_IDS.map((b) => BLOCK_INDEX[b])]);

/** 列 (cx, cz) の ブロック（`blocks.some` で 1 つずつ 見られる）を 見て、くらべない 列か */
export function skipsColumnCopy(seed: number, cx: number, cz: number, blocks: { some(f: (v: number) => boolean): boolean }): boolean {
  return blocks.some((v) => MARKERS.has(v)) || featuresNearChunk(seed, cx * 16, cz * 16).sites.length > 0;
}
