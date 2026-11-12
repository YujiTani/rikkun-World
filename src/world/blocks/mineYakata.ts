/**
 * MINE-1F（docs/design/MINE-1F.md §4.6）: ようかいの やかたの ブロック 8 こ〔2 組 × 4〕の id の 表。id を 書くのは ここ 1 回。
 * 組 `maou`〔まおうの しろ〕・`otera`〔よるの おてら〕。かべ・ゆか・だんは 固い 立方体、たいまつは 細い 棒と ほのおの 形〔ふつうの たいまつと 同じ 描き方〕。
 * このファイルは 型だけ import する 葉。
 */
import type { BlockId } from '../../contracts';

export type YakataLook = 'maou' | 'otera';
export type YakataPart = 'kabe' | 'yuka' | 'dan' | 'taimatsu';

/** 組 × 部品 → ブロックの id（`yakataTable().lookBlocks` の もと） */
export const YAKATA_BLOCKS = {
  maou: { kabe: 'maou_kabe', yuka: 'maou_yuka', dan: 'maou_dan', taimatsu: 'maou_taimatsu' },
  otera: { kabe: 'otera_ishigaki', yuka: 'otera_ishidatami', dan: 'otera_dan', taimatsu: 'onibi_taimatsu' },
} as const satisfies Record<YakataLook, Record<YakataPart, BlockId>>;

/** 8 この id（番号の 並びは この 順） */
export const YAKATA_BLOCK_IDS = [
  YAKATA_BLOCKS.maou.kabe, YAKATA_BLOCKS.maou.yuka, YAKATA_BLOCKS.maou.dan, YAKATA_BLOCKS.maou.taimatsu,
  YAKATA_BLOCKS.otera.kabe, YAKATA_BLOCKS.otera.yuka, YAKATA_BLOCKS.otera.dan, YAKATA_BLOCKS.otera.taimatsu,
] as const;

/** あやしい たいまつ 2 つ（固くない・光 9・細い 棒で 描く） */
const YAKATA_TORCH_IDS = [YAKATA_BLOCKS.maou.taimatsu, YAKATA_BLOCKS.otera.taimatsu] as const;
const TORCH_SET: ReadonlySet<string> = new Set(YAKATA_TORCH_IDS);
/** あやしい たいまつか（ブロックの id で） */
export const isYakataTorch = (id: string): boolean => TORCH_SET.has(id);
