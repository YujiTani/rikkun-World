import { ruby } from './text';

const LEFT_CLICK = `${ruby('左', 'ひだり')}クリック`;

/**
 * 案内画面「たたかう」タブの 文（WEAPON-2 §6.2）。漢字は ruby() でふりがな。
 * 絵は `playOverlay.ts` の `tabArts().fight`（同じ順・同じ数）。
 */
export const FIGHT_CAPTIONS_W2: readonly string[] = [
  `${LEFT_CLICK} で きる`,
  'R で かまえ を かえる',
  `${ruby('中段', 'ちゅうだん')}は ${ruby('突', 'つ')}き、${ruby('上段', 'じょうだん')}は ${ruby('大', 'おお')}げさ${ruby('斬', 'ぎ')}り、${ruby('下段', 'げだん')}は ${ruby('切', 'き')}り${ruby('上', 'あ')}げ`,
  'なぎなた は とおくまで とどく',
  'ゆみ は ながく ひくほど とおくへ',
  `${ruby('防具', 'ぼうぐ')}は ダブルクリック で ${ruby('着', 'き')}る・ぬぐ`,
  `どうぐ は つかうと へる。バー が ${ruby('赤', 'あか')}く なったら つくりなおそう`,
  'よる は おうち に にげよう',
];
