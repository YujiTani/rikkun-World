/**
 * 新しい景色（木 v2・山 v2・舞う 雪と 紅葉・山の 目じるし）の 「いつも 出す」スイッチ。読み方は ここ 1 か所（何も import しない 葉）。
 * 既定は ぜんぶ 出す（yuzu 2026-11-12）。URL に 付けると 古い 形に もどせる:
 *   ?trees=v1 → 古い 木   ?mountain=v1 → 古い 山   ?drift=0 → 雪・紅葉の 舞いを 出さない   ?structures=0 → 目じるしを 置かない
 * 今までの `?trees=v2` `?mountain=v2` `?drift=1` `?structures=1` は 付けても 同じ（既定と 同じ）。
 * Node の テスト・サーバーでは location が 無い ので 既定（ぜんぶ 出す）。古い 形を 確かめる テストは
 * `globalThis.location = { search: '?trees=v1&mountain=v1&structures=0' }` を import より 前に 入れる（フラグは 読みこみの ときに きまる）。
 */
export interface LookFlags {
  readonly treesV2: boolean;
  readonly mountainV2: boolean;
  readonly drift: boolean;
  readonly structures: boolean;
  /** 水の 景色 v2（滝・川・池）。まだ 既定は 切（?water=v2 の ときだけ 出す） */
  readonly waterV2: boolean;
}

export function parseLookFlags(search: string | undefined): LookFlags {
  const q = new URLSearchParams(search ?? '');
  return {
    treesV2: q.get('trees') !== 'v1',
    mountainV2: q.get('mountain') !== 'v1',
    drift: q.get('drift') !== '0',
    structures: q.get('structures') !== '0',
    waterV2: q.get('water') === 'v2',
  };
}

/** いまの ページの スイッチ（読みこみの ときに 1 回） */
export const LOOK: LookFlags = parseLookFlags(typeof location !== 'undefined' && typeof location.search === 'string' ? location.search : undefined);
