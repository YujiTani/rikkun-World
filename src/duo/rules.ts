/** 時間の 倍率。2 人のとき もちもの画面でも ゆっくりに しない（§2.6・AC11）。base = `screen.timeScale()` の 値 */
export function duoTimeScale(base: number, joined: boolean): number {
  return joined ? 1 : base;
}

/** 2P が ボタンで 開こうと する 画面（§8・AC15）。段階 1 で 開けるのは 'inventory'（2P 自分の もちもの）だけ */
export type P2OpenKind = 'inventory' | 'book' | 'builder' | 'henhouse' | 'storage';

/** 画面ごとに 2P が 開けるか（足し忘れは 型で 落とす） */
const P2_MAY_OPEN = {
  inventory: true,
  book: false,
  builder: false,
  henhouse: false,
  storage: false,
} as const satisfies Record<P2OpenKind, boolean>;

export const P2_OPEN_KINDS = Object.keys(P2_MAY_OPEN) as readonly P2OpenKind[];

export function p2MayOpen(kind: P2OpenKind): boolean {
  return P2_MAY_OPEN[kind];
}
