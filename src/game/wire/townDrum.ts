// 街（TOWN-1 1B-2 §2.15 の 4・AC47）: アスレチックの ゴールの 太鼓の つなぎ。たたいた 人の 記録は src/town/townDrum.ts。
import { TownDrum } from '../../town/townDrum';
import { currentTown } from '../../town/townState';
import { playTownDrum } from '../../fx/townDrumSound';
import type { WiredFighters } from './combat';

/** ゴールの 合図の 字（ひらがな・カタカナ） */
const GOAL_TEXT = 'ゴール！';

let drum: TownDrum | null = null;
let onHit: (who: 1 | 2, first: boolean) => void = () => undefined;

export const townDrumNow = (): TownDrum | null => drum;

/** 世界を 作った あとで 1 回（街が なければ 何も しない） */
export function wireTownDrum(deps: WiredFighters): TownDrum | null {
  const { shared, fxSound } = deps;
  const town = currentTown();
  drum = town === null ? null : new TownDrum(town.drumCell());
  shared.townDrum = drum;
  onHit = (who, first) => {
    playTownDrum(fxSound); // 2 回目からも 音は 鳴る
    if (!first) return;
    shared.celebrate.enqueueHouseDone(GOAL_TEXT, who, 'town-goal');
    shared.house?.build.celebrate.bump(); // 小さな 紙ふぶき
  };
  return drum;
}

/** 太鼓の ブロックを 左クリックで たたいた（pressed ＝ 押した 最初の ステップ）。太鼓なら true（ほらない） */
export function townDrumHit(who: 1 | 2, x: number, y: number, z: number, pressed: boolean): boolean {
  if (drum === null || !drum.isDrum(x, y, z)) return false;
  if (pressed) onHit(who, drum.hit(who).first);
  return true;
}
