/**
 * さいふの 口（TOWN-1 1.6〔1F〕§2.3b）。お店・かじや・やたい・食事・おふだの 係が その 人の さいふを 読み・へらし・ふやす。
 * 実体は `DamaService`（count / spend / add）。もちものの `yokai_orb` は 読まない。型だけの 葉。
 */
type WalletWho = 1 | 2;

export interface WalletPort {
  /** その 人の さいふの 数（2P が いなくても 数は のこる） */
  count(who: WalletWho): number;
  /** n 以上 あれば へらして true・たりなければ 何も かえず false */
  spend(who: WalletWho, n: number): boolean;
  /** ふやす。上限で とまる。こえた 分は over（足もとに 落とさない） */
  add(who: WalletWho, n: number): { added: number; over: number };
}

/** さいふに かえる アイテム（`yokai_orb`。絵と 名前の ためだけに のこる。もちものの マスには 入らない） */
export const WALLET_ITEM = 'yokai_orb' as const;
