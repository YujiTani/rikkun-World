/**
 * さいふの 見本（テスト だけが 使う。本番は 読まない。TOWN-1 1.6〔1F〕§2.3b）。
 * お店・かじや・やたい・食事の 係は ポート `wallet` を 通して その 人の さいふを 読み・へらし・ふやす（もちものの `yokai_orb` は 読まない）。
 * ポートの 形（実装は これに 合わせる）:
 *   count(who): number                       その 人の さいふの 数（2P が いなくても 数は のこる）
 *   spend(who, n): boolean                   n 以上 あれば へらして true・たりなければ 何も かえず false
 *   add(who, n): { added; over }             上限で とまる。こえた 分は over（足もとに 落とさない）
 */
type Who = 1 | 2;

export interface WalletPort {
  count(who: Who): number;
  spend(who: Who, n: number): boolean;
  add(who: Who, n: number): { added: number; over: number };
}

/** テスト用の 上限。本番の 値は `DamaService.max()`（§4.12）。ここは 小さな 係の テストに だけ 使う 見本 */
const KIT_WALLET_MAX = 999_999;

export function fakeWallet(): WalletPort & { set(who: Who, n: number): void } {
  const n: Record<Who, number> = { 1: 0, 2: 0 };
  return {
    count: (who) => n[who],
    spend: (who, k) => {
      if (n[who] < k) return false;
      n[who] -= k;
      return true;
    },
    add: (who, k) => {
      const added = Math.max(0, Math.min(k, KIT_WALLET_MAX - n[who]));
      n[who] += added;
      return { added, over: k - added };
    },
    set: (who, k) => {
      n[who] = k;
    },
  };
}
