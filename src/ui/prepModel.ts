/**
 * 「じゅんびちゅう」の表示の決まり（VOX-D。docs/tickets/VOX-D.md「じゅんびちゅうの表示」）。DOM に依らない。
 */
export const PREP_BLOCK_COUNT = 5;
/** 1 秒に 2 回（0.5 秒ごと）「・」がふえる。0〜3 こ */
export const PREP_DOT_MS = 500;
/** 遠くへもどるときの カード: 待ちが これより多い（30 コマ = 0.5 秒）とき出す */
export const PREP_CARD_AFTER_FRAMES = 30;

/** できた ブロックの数 = floor(p × 5)。p = 1 で 5 */
export function prepDone(progress: number): number {
  if (!(progress > 0)) return 0;
  return Math.min(PREP_BLOCK_COUNT, Math.floor(progress * PREP_BLOCK_COUNT));
}

/** 「・」の数（0〜3）。時刻は 見た目だけのもの（合否には使わない） */
export function prepDots(nowMs: number): number {
  return Math.floor(nowMs / PREP_DOT_MS) % 4;
}

/** カードを出すか（遠くへもどる・テレポートの待ち） */
export function showPrepCard(phase: 'boot' | 'play' | 'wait', waitedFrames: number): boolean {
  return phase === 'wait' && waitedFrames > PREP_CARD_AFTER_FRAMES;
}

/** ブロック 5 こ（つち・いし・き・たんす・かまど）。今ある ブロックのアイコン */
export const PREP_ICONS = ['dirt', 'coal_ore', 'log', 'tansu', 'furnace'] as const;
