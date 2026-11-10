// COOP-1 5d: 建築士さんの 中身は「話した 人」の 物で 動く。人ごとの もちもの・場所を、その ときの 話した 人へ むける 小さな 道具。DOM・three なし。
export type Who = 1 | 2;

/**
 * いまの もちもの（get() が 返す 物）へ そのまま とりつぐ 入れ物。メソッド・プロパティを 呼ぶ たびに get() を 引くので、
 * 話した 人が かわっても 作りなおさない。メソッドは 最初に 使った とき 1 回だけ 包んで 使いまわす（毎フレーム 新しい 関数を 作らない）。
 * 書きこみは エラー（読むだけの 入れ物）。
 */
export function bagVia<T extends object>(get: () => T): T {
  const wrapped = new Map<PropertyKey, (...a: unknown[]) => unknown>();
  return new Proxy({} as T, {
    get: (_t, key) => {
      const b = get() as Record<PropertyKey, unknown>;
      const v = b[key];
      if (typeof v !== 'function') return v;
      let w = wrapped.get(key);
      if (!w) {
        w = (...a: unknown[]) => (get() as Record<PropertyKey, (...x: unknown[]) => unknown>)[key]!(...a);
        wrapped.set(key, w);
      }
      return w;
    },
    set: () => {
      throw new Error('bagVia は 読むだけ');
    },
  });
}
