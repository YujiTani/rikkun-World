import { currentTown } from './townState';

/**
 * TOWN-1 1.3 AC9: 妖怪の 技（ぬりかべの たおれこみ・水で 石・がしゃどくろの たたきつけ）から 守る ブロックか。
 * 街の はんい（あきちの 中も。高さは 問わない）。妖怪・がしゃどくろ・ほる の 3 つが ぜんぶ これを 使う（守りの 判定は ここ 1 か所）。
 * プレイヤーの ほる・置く は あきちが あく ので 別（`townLocked`、src/game/wire/town.ts）。
 */
export function townGuards(x: number, _y: number, z: number): boolean {
  return currentTown()?.inTown(x, z) ?? false;
}
