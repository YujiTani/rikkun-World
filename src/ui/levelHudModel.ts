import type { LevelState } from '../level/LevelSystem';

/** レベルの 棒に 出す 値（1P も 2P も 同じ。DOM に 書く 前の 形） */
export interface LevelBarView {
  /** 「レベル 3」の バッジに 入れる 数 */
  badge: string;
  /** 「2 / 15」（いまの けいけんち / 次まで） */
  num: string;
  /** 棒の 長さ（%。0〜100） */
  fillPct: number;
}

export function levelBarView(st: LevelState): LevelBarView {
  return {
    badge: String(st.level),
    num: `${st.xp} / ${st.next}`,
    fillPct: Math.min(100, (st.xp / st.next) * 100),
  };
}
