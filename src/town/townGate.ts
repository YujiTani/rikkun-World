import { Builder, T } from './townBuilder';
import { GATE, buildTower, buildYard } from './townGateTower';

export { GATE };

/**
 * TOWN-1 1B-2 試作: 街の 門（楼門。townGateTower.ts）と 朱色の たいこ橋の 置き方の 表（ローカル座標 u ＝ 西→東・v ＝ 奥→手前）。
 * たいこ橋は 用水路の 橋の 上に ふみ板を もり上げた そりの ある 橋（橋の ブロックは 地面と 同じ 高さ。もり上げは 1 マスずつ 上がる・下がる）。
 */

/** たいこ橋（橋の はば 3 の 列 u0〜u2 ＝ u0, u0+1, u0+2。わたる 向きに 並ぶ v の 列と もり上げの 高さ extra（橋の 上に 重ねる ブロックの 数）） */
export const TAIKO = [
  /** 奥の 用水路（v 18〜22）: 奥の 列（1 だん 高い）から 地面へ。よろずやの 前・だいくの 前 */
  { u: 10, v0: 18, extra: [1, 2, 2, 2, 1] },
  { u: 62, v0: 18, extra: [1, 2, 2, 2, 1] },
  /** 手前の 用水路（v 90〜93）: 門の 内がわ */
  { u: 49, v0: 90, extra: [1, 2, 2, 1] },
] as const;

export function buildGate(b: Builder): void {
  buildTower(b);
  buildYard(b);
  taikoBridges(b);
}

/**
 * たいこ橋: ふみ板は 朱の 横・こい茶の 上（taiko_deck）・下の はしらは 石。橋の 両がわの ひとつ 外の マス（用水路の 上）に 朱の らんかん（柱と 横木）・
 * 4 すみに ぎぼし。らんかんは 橋の はば（3）の そとに 立つ ので、歩く はばは へらない。向きは 街の 向きに あわせる（@u+ ＝ 橋の がわを 正面に）。
 * 半分の 高さの 段は 作れない（小物ブロックは 当たりが 1 マス ぶん ある ため、半段だと 浮いて 見える）ので、1 マスずつの ゆるい そり。
 */
function taikoBridges(b: Builder): void {
  for (const t of TAIKO) {
    const last = t.extra.length - 1;
    t.extra.forEach((e, i) => {
      const v = t.v0 + i;
      for (let u = t.u; u < t.u + 3; u++) {
        if (e > 1) b.fill(u, v, 0, u, v, e - 2, T('ishizumi'));
        b.put(u, v, e - 1, T('taiko_deck'));
      }
      const end = i === 0 || i === last;
      b.put(t.u - 1, v, e, `${T(end ? 'giboshi' : 'taiko_rail')}@u+`);
      b.put(t.u + 3, v, e, `${T(end ? 'giboshi' : 'taiko_rail')}@u-`);
    });
  }
}
