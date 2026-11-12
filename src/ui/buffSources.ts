import { jumpHeightWith } from '../content/items/gadgetTuning';
import type { ItemId, W2Settings } from '../contracts';
import { legendMoveMulOf } from '../legend/defs';
import type { BuffSources } from './buffIconsModel';

/**
 * バフ アイコン（WEAPON-8 §2.4・LEGEND-4 §3.4）の 倍率の 出どころ。1P（step.ts）も 2P（duoPlay.ts）も これを 1 度 作って 使う（式を 2 か所に 書かない）。
 * 速さ = 手に 持つ 物の passive（`legendMoveMulOf`）。ジャンプ = 体の ジャンプの 高さの 式（`jumpHeightWith`。わらじ・黒龍）÷ 土台の 高さ
 */
export function createBuffSources(w2: Pick<W2Settings, 'legendary'>, baseJump: () => number): BuffSources {
  return {
    moveMul: (held: ItemId | null) => legendMoveMulOf(w2, held),
    jumpMul: (held: ItemId | null, legs: ItemId | null) => {
      const base = baseJump();
      return base > 0 ? jumpHeightWith(legs, base, held) / base : 1;
    },
  };
}
