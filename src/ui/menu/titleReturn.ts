/**
 * タイトルがめんに もどる判断。保存に失敗したら 読みこまない。
 * 成功しても「ほぞんした」とは言わない（呼び側も言わない）。
 */
export interface TitleReturnInput {
  /** SaveManager が 書ける状態か */
  enabled: boolean;
  /** ?nosave=1（保存しない約束。読みこみ直してよい） */
  nosave: boolean;
  failuresBefore: number;
  failuresAfter: number;
  /** まだ置きものを書く前で、保存を止めている */
  held: boolean;
  /** まだ書いていない変更がある */
  dirty: boolean;
}

export type TitleReturnDecision = 'reload' | 'stay';

export function decideTitleReturn(o: TitleReturnInput): TitleReturnDecision {
  if (o.failuresAfter > o.failuresBefore) return 'stay';
  if (o.nosave) return 'reload';
  if (!o.enabled) return 'stay';
  if (o.held && o.dirty) return 'stay';
  return 'reload';
}

export const TITLE_RETURN_STAY = 'ほぞん できなかったよ。このまま あそぼう';
