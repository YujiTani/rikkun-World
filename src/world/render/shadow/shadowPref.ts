// 設定の「かげ オン／オフ」をおぼえる（localStorage `rikkun.shadow.v1`）。
// はじめの値の決め方は 1 か所: src/start/weightPref.ts の decideWeightedStart（GFX-1。URL > 環境変数 > 保存 > おもさ）。
// `?shadow=0` は影のしくみそのものを作らない（CI でほかの spec が重くならないように）。

export const SHADOW_STORAGE_KEY = 'rikkun.shadow.v1';

export interface ShadowStart {
  /** 影のしくみ（地図・材料の差し込み）を作るか */
  build: boolean;
  /** 作ったときの はじめの オン／オフ */
  on: boolean;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function saveShadowPref(store: KeyValueStore | null, on: boolean): void {
  try {
    store?.setItem(SHADOW_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // 書けなくても遊べる
  }
}
