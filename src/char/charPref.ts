// キャラ（女の子・男の子）の 決め方と おぼえ方（localStorage `rikkun.char.v1`。CHAR-5 §4.1）。
// 決める順: URL `?char=block` > URL `?char=boy|girl` > おぼえた値（?nosave=1 のときは 読まない）> girl。
// START-1 の えらぶ 画面も この 書き方（CHAR_STORAGE_KEY・saveChar）を 使う。

export const CHAR_STORAGE_KEY = 'rikkun.char.v1';

export type CharChoice = 'girl' | 'boy';
export type CharMode = CharChoice | 'block';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isChoice = (v: unknown): v is CharChoice => v === 'boy' || v === 'girl';

export function decideChar(search: string, store: KeyValueStore | null): CharMode {
  const q = new URLSearchParams(search);
  const param = q.get('char');
  if (param === 'block') return 'block';
  if (isChoice(param)) return param;
  if (q.get('nosave') !== '1') {
    try {
      const saved = store?.getItem(CHAR_STORAGE_KEY) ?? null;
      if (isChoice(saved)) return saved;
    } catch {
      // 読めなくても 遊べる
    }
  }
  return 'girl';
}

export function saveChar(store: KeyValueStore | null, kind: CharChoice): void {
  try {
    store?.setItem(CHAR_STORAGE_KEY, kind);
  } catch {
    // 書けなくても 遊べる
  }
}

export interface CharController {
  get(): { kind: CharMode };
  set(kind: CharChoice): void;
}

export interface CharControllerDeps {
  search: string;
  store: KeyValueStore | null;
  /** START-1: スタートメニューで えらんだ キャラ（あれば URL・おぼえた値より 先。メニューが すでに 書いて いる） */
  initial?: CharMode;
  /** 切りかえの 読みこみ口（始めるときは 呼ばない） */
  onSwitch: (kind: CharChoice) => void;
}

export function createCharController(deps: CharControllerDeps): CharController {
  const q = new URLSearchParams(deps.search);
  const nosave = q.get('nosave') === '1';
  const store = nosave ? null : deps.store;
  let kind = deps.initial ?? decideChar(deps.search, store);
  const param = q.get('char');
  if (deps.initial === undefined && isChoice(param)) saveChar(store, param); // URL で 始めたときも おぼえる
  return {
    get: () => ({ kind }),
    set(next) {
      if (kind === 'block' || kind === next || !isChoice(next)) return;
      kind = next;
      saveChar(store, next);
      deps.onSwitch(next);
    },
  };
}
