/**
 * 説明の行（ItemDef.info）が 無くて よい アイテムの id と 理由（テストの 許可リスト。ここ 1 か所）。
 * 足すときは 理由を 書く。説明が 無いと build.ts は ITEM_INFO[item]?. で 読むので こわれはしないが、書き忘れと 区別するため。
 */
export const NO_INFO_OK: Readonly<Record<string, string>> = {
  geyser_dirt: '地形のブロック',
  snow: '地形のブロック',
  momiji_leaves: '地形のブロック',
  matsu_leaves: '地形のブロック',
  flower_y: 'かざりのブロック',
  flower_o: 'かざりのブロック',
  flower_p: 'かざりのブロック',
  bamboo: 'かざりのブロック',
  nobana: 'かざりのブロック',
};
