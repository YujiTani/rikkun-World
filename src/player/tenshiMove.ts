import type { ItemId } from '../contracts';
import { LEGEND4_ID } from '../content/items/ids';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';

/**
 * LEGEND-4 PR3 天使の弓（docs/design/LEGEND-4.md §6.3）: 空中ジャンプの のこりを 数える 部品。three なし。数は `LEGEND4_TUNING.tenshi`。
 * 体（PlayerController）が 1 人に 1 つ 持つ（1P・2P で 別）。「持って いる」は 1P の step.ts・2P の duoPlay.ts が `applyTenshiMotion` で 毎ステップ 体に 書く。
 */
const T = LEGEND4_TUNING.tenshi;

/** 天使の弓の id（比べる 側は ここを 読む。id の 文字を あちこちに 書かない。ルール #304） */
const TENSHI_ID = LEGEND4_ID.tenshi_yumi;

/** 手に 持って いるのが 天使の弓か */
export const isTenshi = (held: ItemId | null): boolean => held === TENSHI_ID;

/** 持って いる 間 落下ダメージを 数えない（PlayerCombat の `noFall` に 重ねる） */
export const tenshiNoFall = (held: ItemId | null): boolean => T.noFallDamage && isTenshi(held);

/** 体の `motion` の うち 天使の弓が 書く 項目 */
export interface TenshiMotion {
  /** 天使の弓を 持って いる（空中ジャンプ・ゆっくり 落ちる） */
  tenshi: boolean;
}

/** 毎ステップ、持って いる 物を 体の `motion` へ（1P・2P 同じ 口） */
export function applyTenshiMotion(motion: TenshiMotion, held: ItemId | null): void {
  motion.tenshi = isTenshi(held);
}

/** 1 ステップの 入力 */
export interface AirJumpIn {
  /** 空中か（地面に 立って いない・水・ロープ・ぶら下がり・うかぶ 間 の どれでも ない） */
  air: boolean;
  /** この ステップで ジャンプを 新しく 押した（押しっぱなしは false） */
  pressed: boolean;
  /** 天使の弓を 持って いる */
  held: boolean;
  /** ジャンプが 止められて いない（怯み・わざの 間など） */
  free: boolean;
}

export class AirJumpState {
  /** のこり（人ごと 1 つ） */
  left: number = T.airJumps;

  /** 今 までに 使った 回数（1・2・3 回目の 音の 高さに 使う） */
  get used(): number {
    return T.airJumps - this.left;
  }

  /** 地面・水・ロープに いる ステップに 呼ぶ（手に 何を 持って いても もどる） */
  refill(): void {
    this.left = T.airJumps;
  }

  /** 空中で 新しく 押された ステップに 1 回 とべる なら のこりを 1 へらして true */
  tryJump(i: AirJumpIn): boolean {
    if (!i.air || !i.pressed || !i.held || !i.free || this.left <= 0) return false;
    this.left -= 1;
    return true;
  }
}
