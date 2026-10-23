import { withRuby } from '../text';
import type { ChapterDef } from './bookNav';

/**
 * BOOK-1 §4.2・§4.3: 本の 章と 項目（データだけ）。新しい わざは BOOK_ITEMS に 1 つ 足すだけで 本にのる。
 * 説明の ［漢字｜よみ］ は ruby() で ふりがなを つける（`withRuby()`。ほかの 字は エスケープ。WEAPON-7 §2.7）。
 */
export interface BookItem {
  id: string;
  chapter: string;
  /** 見出し（8 字まで・漢字なし） */
  title: string;
  /** 説明（HTML。1〜2 文・50 字まで） */
  caption: string;
  /** 挿絵（public/ の 中の パス） */
  art: string;
}

const item = (chapter: string, id: string, title: string, caption: string): BookItem => ({ id, chapter, title, caption: withRuby(caption), art: `book/${id}.png` });

export const BOOK_CHAPTERS: readonly ChapterDef[] = [
  { id: 'move', label: 'うごく', icon: '🏃' },
  { id: 'dig', label: 'ほる・おく', icon: '⛏' },
  { id: 'fight', label: 'たたかう', icon: '⚔' },
  { id: 'craft', label: 'つくる・やく', icon: '🔨' },
  { id: 'grow', label: 'そだてる', icon: '🌱' },
];

export const BOOK_ITEMS: readonly BookItem[] = [
  item('move', 'move-walk', 'あるく', 'W A S D で あるく'),
  item('move', 'move-jump', 'ジャンプ', 'スペース で ジャンプ'),
  item('move', 'move-look', 'カメラ', 'マウス で カメラ を まわす'),
  item('move', 'move-run', 'はしる', 'シフトを おしながら あるくと はしる'),

  item('dig', 'dig-hold', 'ほる', '［左｜ひだり］クリック を おしつづけて ほる'),
  item('dig', 'dig-crack', 'こわす', 'ひびが MAX で もういちど おす'),
  item('dig', 'dig-place', 'おく', '［右｜みぎ］クリック で おく'),
  item('dig', 'dig-select', 'もちものを えらぶ', '1〜9 か ホイール で もちものを えらぶ'),
  item('dig', 'dig-bag', 'もちもの', 'E で もちもの をひらく'),

  item('fight', 'fight-swing', 'きる', '［左｜ひだり］クリック で きる'),
  item('fight', 'fight-stance', 'かまえ', 'R で かまえ を かえる'),
  item('fight', 'fight-chudan', 'つき', '［中段｜ちゅうだん］は ［突｜つ］き'),
  item('fight', 'fight-jodan', 'おおげさぎり', '［上段｜じょうだん］は ［大｜おお］げさ［斬｜ぎ］り'),
  item('fight', 'fight-gedan', 'きりあげ', '［下段｜げだん］は ［切｜き］り［上｜あ］げ'),
  // WEAPON-7: ためわざ（ヌシから 出る ことは 書かない。見つけた おどろきを のこす）
  item('fight', 'fight-charge', 'ためわざ', 'レジェンダリー の ぶき は ［左｜ひだり］クリック を ながく おして はなすと ためわざ'),
  // 週次 1019: WEAPON-5 パリィ・WEAPON-6 3 だんこうげき（できる ことと おす キーだけ）
  item('fight', 'fight-parry', 'パリィ', 'かたな で シフト を おしながら ［左｜ひだり］クリック すると はじく'),
  item('fight', 'fight-combo', '3だんぎり', 'きらめく カタナ は ［左｜ひだり］クリック を つづけて おすと 3 だん きれる'),
  item('fight', 'fight-naginata', 'なぎなた', 'なぎなた は とおくまで とどく'),
  item('fight', 'fight-yumi', 'ゆみ', 'ゆみ は ながく ひくほど とおくへ'),
  item('fight', 'fight-armor', 'ぼうぐ', '［防具｜ぼうぐ］は ダブルクリック で ［着｜き］る・ぬぐ'),
  item('fight', 'fight-wear', 'どうぐの バー', 'どうぐ は つかうと へる。バー が ［赤｜あか］く なったら つくりなおそう'),
  item('fight', 'fight-night', 'よる', 'よる は おうち に にげよう'),

  item('craft', 'craft-open', 'つくる', 'E で つくる'),
  item('craft', 'craft-glow', 'ひかる もの', 'ひかっている のを おす'),
  item('craft', 'craft-hammer', 'かなづち', 'かなづち が でたら つくれる'),
  item('craft', 'craft-furnace', 'かまど', 'かまど に ［右｜みぎ］クリック で やく'),
  item('craft', 'craft-fuel', 'ねんりょう', 'ねんりょう は せきたん・あぶら・き'),
  item('craft', 'craft-drop', 'すてる', 'Q で 1こ すてる'),
  item('craft', 'craft-tansu', 'たんす', 'たんす に しまう'),
  item('craft', 'craft-log', 'できごと', 'L で できごと を みる'),
  item('craft', 'craft-nearby', 'ちかくの たんす', 'ちかくの たんす の ものも つかえる'),

  item('grow', 'grow-till', 'はたけ', 'くわ を もって ［草｜くさ］か ［土｜つち］を ［右｜みぎ］クリック すると ［畑｜はたけ］に なる。［素手｜すで］なら 3 ［回｜かい］ ［右｜みぎ］クリック'),
  item('grow', 'grow-sow', 'たねまき', 'たね を もって ［畑｜はたけ］を ［右｜みぎ］クリック すると たね を まける'),
  item('grow', 'grow-wet', 'みずの そば', '［水｜みず］の そば の ［畑｜はたけ］は ［色｜いろ］が こく なって はやく ［育｜そだ］つ'),
  item('grow', 'grow-harvest', 'とる', 'みのったら ［左｜ひだり］クリック で とれる。まだ の ときは とれないよ'),
  item('grow', 'grow-eat', 'たべる', 'やさい を もって ［右｜みぎ］クリック で たべる と ハート が もどる'),
  item('grow', 'grow-seeds', 'たねさがし', 'たね は さがそう: かかし の ある ふるい ［畑｜はたけ］、やせいの やさい、［草｜くさ］を こわす、［妖怪｜ようかい］の おとしもの'),
  item('grow', 'grow-light', 'あかるさ', '［明｜あか］るい ところ で ［育｜そだ］つ。［夜｜よる］は たいまつ の そば なら ［育｜そだ］つ'),
  item('grow', 'grow-can-fill', 'じょうろで くむ', 'じょうろ を もって ［水｜みず］を ［右｜みぎ］クリック で くむ'),
  item('grow', 'grow-can-water', 'みずやり', '［畑｜はたけ］を ［右｜みぎ］クリック で ［水｜みず］やり。1 ［日｜にち］ しめる よ'),
  item('grow', 'grow-sprinkler', 'スプリンクラー', 'スプリンクラー を おくと まわり の ［畑｜はたけ］が ずっと しめる'),
  item('grow', 'grow-pet', 'なでる', 'やさい を ［右｜みぎ］クリック で なでる と ごきげん に なって すこし はやく ［育｜そだ］つ'),
  item('grow', 'grow-bucket', 'バケツ', 'バケツ で ［水｜みず］を くんで ［畑｜はたけ］の そば に おく と ずっと しめる'),
  // 週次 1019: LIVE-1 にわとり
  item('grow', 'grow-bug', 'むしとり', 'あみ で ［木｜き］を ［右｜みぎ］クリック すると むし が とれる'),
  item('grow', 'grow-chicken', 'にわとり', 'むし を もって にわとり を ［右｜みぎ］クリック すると なかよく なれる'),
  item('grow', 'grow-carry', 'だっこ', 'なかよしの にわとり は ［右｜みぎ］クリック を ながく おすと だっこ できる'),
];
