import { currentTown } from './townState';

/**
 * TOWN-1 1.4 AC9: 妖怪の 技（ぬりかべの たおれこみ・水で 石・がしゃどくろの たたきつけ・ふんかの くぼみ）でも こわれない ブロックか。
 * ＝ あきちの 区画の 中・用水路の 石段・みぞの はしの 石がき だけ（`TownPlan.keeps`）。それ以外の 街の ブロックは 外と 同じに かわる
 * （かわった マスは 記録されて 2 日で もどる。src/town/townRepairs.ts）。妖怪・がしゃどくろ・ふんかの 3 つが ぜんぶ これを 使う（守りの 判定は ここ 1 か所）。
 * プレイヤーの ほる・置く は 別（`townLocked`、src/game/wire/townRepair.ts）。
 */
export function townGuards(x: number, y: number, z: number): boolean {
  return currentTown()?.keeps(x, y, z) ?? false;
}
