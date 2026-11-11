/**
 * MINE-1F §3.8 の 動きの 表（60 コマ ＝ 1 秒）。コマの 数の 出どころは ここ 1 か所。門の コマは えらんだ 音 B の 時刻に そろえて ある
 * （「ず」0.5 秒 ＝ 30 コマで 門が とまる・「ずん」0.64 秒 ＝ 38 コマで ほこり・ひらくの「ずん」0.3 秒 ＝ 18 コマ。音は かえない。`docs/audio/MINE-1F.md`）。
 * 「動きを へらす」は reduce = true: 門は 0 コマで 動かず かわる・ほこり なし・中身は 回らない・札は はねない・7 ひきは うき上がらない。
 * 何も import しない 葉。
 */
export interface YakataMotion {
  /** 門が ふさがる: riseTo = 上がる 割合〔1 = 門の 高さ ぜんぶ〕・stopAt = ぴたっと とまる コマ〔音の「ず」〕・dustAt = ほこり〔音の「ずん」〕・endAt = ほこりが 消える コマ */
  gateClose: { riseTo: number; stopAt: number; dustAt: number; endAt: number };
  /** 門が ひらく: さがりきる コマ〔音の「ずん」〕 */
  gateOpenEnd: number;
  /** 7 ひきが あらわれる: 0〜fadeEnd で うすい → こい・fadeEnd〜endAt は 決めポーズ・riseBlocks = 下から うき上がる マス */
  foeAppear: { fadeEnd: number; endAt: number; riseBlocks: number };
  /** うかぶ 中身: spinFrames コマで 1 回転〔0 = 回らない〕・bobFrames コマで 上下 1 往復・bobAmp マス */
  floatItem: { spinFrames: number; bobFrames: number; bobAmp: number };
  /** のこりの 札の はね: 上へ upFrames コマ・もどる backFrames コマ・上へ hopPoints 点 */
  labelHop: { upFrames: number; backFrames: number; hopPoints: number };
  /** あやしい たいまつの 明るさの ゆれ: 1 回 torchSwaySec 秒・ふれはば ±torchSwayAmp〔点滅しない〕 */
  torchSwaySec: number;
  torchSwayAmp: number;
}

const NORMAL: YakataMotion = {
  gateClose: { riseTo: 1, stopAt: 30, dustAt: 38, endAt: 50 },
  gateOpenEnd: 18,
  foeAppear: { fadeEnd: 30, endAt: 60, riseBlocks: 0.3 },
  floatItem: { spinFrames: 240, bobFrames: 120, bobAmp: 0.1 },
  labelHop: { upFrames: 6, backFrames: 12, hopPoints: 2 },
  torchSwaySec: 2.4, // 1 回 2 秒 以上
  torchSwayAmp: 0.12, // ±15% まで
};

export function yakataMotion(reduce: boolean): YakataMotion {
  if (!reduce) return NORMAL;
  return {
    ...NORMAL,
    gateClose: { riseTo: 1, stopAt: 0, dustAt: 0, endAt: 0 },
    gateOpenEnd: 0,
    foeAppear: { ...NORMAL.foeAppear, riseBlocks: 0 },
    floatItem: { ...NORMAL.floatItem, spinFrames: 0, bobAmp: 0 }, // spinFrames 0 = 回らない
    labelHop: { ...NORMAL.labelHop, hopPoints: 0 },
  };
}
