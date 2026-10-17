// 設定の「かげ オン／オフ」をおぼえる（localStorage `rikkun.shadow.v1`）と、はじめの値の決め方（SHADOW.md §8.1）。
// 決める順: URL の `?shadow=0|1` > 保存した値（?nosave=1 のときは読まない）> E2E の既定（VITE_SHADOW_DEFAULT=off）> オン。
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

export function decideShadowStart(search: string, envDefault: string | undefined, store: KeyValueStore | null): ShadowStart {
  const q = new URLSearchParams(search);
  const param = q.get('shadow');
  if (param === '0') return { build: false, on: false };
  if (param === '1') return { build: true, on: true };
  const nosave = q.get('nosave') === '1';
  let saved: string | null = null;
  if (!nosave) {
    try {
      saved = store?.getItem(SHADOW_STORAGE_KEY) ?? null;
    } catch {
      saved = null;
    }
  }
  if (saved === 'on') return { build: true, on: true };
  if (saved === 'off') return { build: true, on: false };
  if (envDefault === 'off') return { build: false, on: false };
  return { build: true, on: true };
}

export function saveShadowPref(store: KeyValueStore | null, on: boolean): void {
  try {
    store?.setItem(SHADOW_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // 書けなくても遊べる
  }
}
