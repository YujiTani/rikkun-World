/**
 * BOOK-1 §3.6: 本と ボタンの 場所（画面の 大きさだけで 決まる。DOM も 3D も 使わない）。
 * たて ＝ 上 24 ＋ ボタンの行 64 ＋ すきま 8 ＋ 本 ＋ 下 24。よこ ＝ 本 ＋ （◀▶ 64 ＋ すきま 16）× 2 ＋ 左右 24 × 2。
 */
export interface Rect {
  l: number;
  t: number;
  w: number;
  h: number;
}

export const BOOK_COVER = 16;
export const BTN = 64;
const MARGIN = 24;
const ROW_GAP = 8;
const SIDE_GAP = 16;
/** 本の 高さの 決まった 段（表に ある 3 つ）。小さい 画面では 画面に 合わせる */
const HEIGHT_STEPS = [540, 640, 720] as const;

export interface BookLayout {
  vw: number;
  vh: number;
  /** 表紙・金具を ふくむ 外がわ */
  book: Rect;
  /** 紙の 見開き（表紙を のぞく） */
  spread: Rect;
  pageW: number;
  pageH: number;
  /** 挿絵の 拡大（整数倍） */
  artScale: 2 | 3 | 4;
  buttons: Record<'back' | 'toc' | 'close' | 'prev' | 'next', Rect>;
}

export function bookLayout(vw: number, vh: number): BookLayout {
  const limit = Math.min(vh - (MARGIN * 2 + BTN + ROW_GAP), ((vw - (MARGIN * 2 + (BTN + SIDE_GAP) * 2)) * 2) / 3);
  const step = [...HEIGHT_STEPS].reverse().find((s) => s <= limit);
  const h = step ?? Math.max(160, Math.floor(limit / 4) * 4);
  const w = (h * 3) / 2;
  const top = MARGIN + BTN + ROW_GAP;
  const left = Math.round((vw - w) / 2);
  const book: Rect = { l: left, t: top, w, h };
  const pageW = (w - BOOK_COVER * 2) / 2;
  const pageH = h - BOOK_COVER * 2;
  const inner = pageW - 48;
  const artScale = inner >= 416 ? 4 : inner >= 308 ? 3 : 2;
  const midY = top + h / 2 - BTN / 2;
  return {
    vw,
    vh,
    book,
    spread: { l: left + BOOK_COVER, t: top + BOOK_COVER, w: pageW * 2, h: pageH },
    pageW,
    pageH,
    artScale,
    buttons: {
      back: { l: left, t: MARGIN, w: BTN, h: BTN },
      toc: { l: left + BTN + SIDE_GAP, t: MARGIN, w: BTN, h: BTN },
      close: { l: left + w - BTN, t: MARGIN, w: BTN, h: BTN },
      prev: { l: left - SIDE_GAP - BTN, t: midY, w: BTN, h: BTN },
      next: { l: left + w + SIDE_GAP, t: midY, w: BTN, h: BTN },
    },
  };
}
