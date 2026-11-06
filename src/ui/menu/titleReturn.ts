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

/** COOP-1 作業 3d（AC71）: タイトルへ もどる 流れの 部品（テストでは 偽物を わたす） */
export interface TitleReturnFlow {
  /** 今の 保存を して（待つ）、decideTitleReturn に わたす 数を 返す。2P が 参加中なら 2P の 持ち物・レベルも 保存に 入る */
  saveNow(): Promise<TitleReturnInput>;
  /** 2P の あとしまつ（`DuoSession.leave`）。読みなおす 直前だけ 呼ぶ */
  leaveDuo(reason: 'reload'): void;
  /** `location.reload()` */
  reload(): void;
}

/**
 * 保存 → 'reload' なら 2P を やめさせて（`leaveDuo('reload')`）読みなおす。'stay'（保存できず「ほぞん できなかったよ」）なら 2P は のこる（AC71）。
 * wire/save.ts の setTitleReturn が 使う。
 */
export async function runTitleReturn(f: TitleReturnFlow): Promise<TitleReturnDecision> {
  const decision = decideTitleReturn(await f.saveNow());
  if (decision === 'reload') {
    f.leaveDuo('reload');
    f.reload();
  }
  return decision;
}
