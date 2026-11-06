// DECLARATION ONLY（tester・COOP-1 作業 1）: 実装は developer が この ファイルを 書きかえて 入れる。テストは rules.test.ts。

/** 時間の 倍率。2 人のとき もちもの画面でも ゆっくりに しない（§2.6・AC11）。base = `screen.timeScale()` の 値 */
export declare function duoTimeScale(base: number, joined: boolean): number;

/** 2P が ボタンで 開こうと する 画面（§8・AC15）。段階 1 で 開けるのは 'inventory'（2P 自分の もちもの）だけ */
export type P2OpenKind = 'inventory' | 'book' | 'builder' | 'henhouse' | 'storage';
export declare const P2_OPEN_KINDS: readonly P2OpenKind[];
export declare function p2MayOpen(kind: P2OpenKind): boolean;
