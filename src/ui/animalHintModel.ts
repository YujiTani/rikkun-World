import type { AnimalEvent, AnimalHintKind, AnimalWindowHint, ItemId } from '../contracts';
import { ruby } from './text';

/** 合図（LIVE-1 §3.1）。チップは 120 ステップで消える。同じ合図は のこり時間を もどすだけ（M7 §3.3 と 同じ） */
export const ANIMAL_HINT_STEPS = 120;

/** チップに そえる 絵（'full' = おなかいっぱい・'carry' = だっこ。専用 の 絵 が できるまで にわとり で かわり） */
export type AnimalHintArt = ItemId | 'heart' | 'chicken' | 'chickenRibbon' | 'sun' | 'chick' | 'zzz' | 'hourglass' | 'hand';

const R = ruby('右', 'みぎ');

/** 文（漢字は ふりがな付き。HTML）と 添える絵（左から）。仕様 §3.1。数 8 は 設定 `animalFriendMax` の 初期値 */
type HintView = { html: string; art: ReadonlyArray<AnimalHintArt> };
/** 画面 では「とりごや」「こ」「おとな」「こたつ」に そろえる（G7）。漢字は 右 だけ（ふりがな付き） */
export const ANIMAL_HINT_VIEW: Readonly<Record<AnimalWindowHint | 'kitFull', HintView>> = {
  feedHint: { html: `むし を もって ${R}クリック で あげよう`, art: ['mushi', 'chicken'] },
  fullHint: { html: 'おなか いっぱい。すこし まってね', art: ['chicken', 'sun'] },
  friendFull: { html: 'なかま は 8 わ まで', art: ['chickenRibbon'] },
  treeEmpty: { html: 'むし は おやすみ。ほか の き を さがそう', art: ['leaves', 'log'] },
  netHint: { html: `あみ で き を ねらって ${R}クリック`, art: ['mushi_ami', 'leaves'] },
  carryHint: { html: `${R}クリック を ながく おす と だっこ`, art: ['chickenRibbon'] },
  carryWild: { html: 'なかま に なったら だっこ できる よ', art: ['chickenRibbon'] },
  cantPutHere: { html: 'ここ には おろせない', art: ['chicken', 'stone'] },
  // LIVE-2 版 3（§3.1）。絵 は 左 から
  kitNeedEgg: { html: `たまご を もって ${R}クリック`, art: ['egg', 'nukunuku'] },
  kitWait: { html: 'あたため ちゅう。まってね', art: ['nukunuku', 'hourglass'] },
  // LIVE-2.1（§3.1）: たまご は 6 こ まで・おけない 所（こたつ も）・こたつ いっぱい（合図 は 10 に ふえた）
  kitMax: { html: 'あたためる たまご は 6 こ まで', art: ['egg', 'egg', 'egg', 'egg', 'egg', 'egg'] },
  kitFull: { html: 'この こたつ は いっぱい', art: ['nukunuku', 'egg', 'egg', 'egg'] },
  coopNoRoom: { html: 'ここ には おけない よ', art: ['toriya', 'dirt', 'stone'] },
  coopMax: { html: 'とりごや は 3 つ まで', art: ['toriya'] },
  coopFull: { html: 'この とりごや は いっぱい', art: ['toriya', 'chicken'] },
  coopNotEmpty: { html: 'こ が いる から こわせない よ。だっこ で そと へ', art: ['toriya', 'chick', 'hand'] },
  coopNoEgg: { html: 'むし を あげる と たまご を うむ よ', art: ['mushi', 'chicken', 'egg'] },
  sleepHint: { html: 'ねてる よ。あさ に あげよう', art: ['zzz', 'sun'] },
  // LIVE-3（§3.1）: なま は たべられない（絵: にく → かまど → こんがり にく）
  rawMeat: { html: 'なま は たべられない よ。かまど で やこう', art: ['momo_nama', 'furnace', 'momo_yaki'] },
};

/** 出ている合図を持つ（DOM なしでテストできる） */
export class AnimalHintModel {
  private hint: AnimalWindowHint | 'kitFull' | null = null;
  private left = 0;
  shown = 0;

  show(kind: AnimalHintKind | 'kitFull'): void {
    this.hint = kind;
    this.left = ANIMAL_HINT_STEPS;
    this.shown++;
  }

  /** 出来事の列から 合図だけ拾う（つなぎ込みが `animals.events()` の列を わたす） */
  feed(events: readonly AnimalEvent[]): void {
    for (const e of events) if (e.type === 'hint') this.show(e.hint);
  }

  step(): void {
    if (this.left <= 0) return;
    if (--this.left <= 0) this.hint = null;
  }

  current(): AnimalWindowHint | null {
    // 'kitFull' は 契約 の `AnimalLive2Hint` に 入る まで 型 が 合わない ので、ここ で 合わせる
    return this.hint as AnimalWindowHint | null;
  }
  stepsLeft(): number {
    return this.left;
  }
}
