import type { AnimalEvent, AnimalHintKind, AnimalLive1Hint, AnimalLive2Hint, AnimalWindowHint, ItemId } from '../contracts';
import { ruby } from './text';

/** 合図（LIVE-1 §3.1）。チップは 120 ステップで消える。同じ合図は のこり時間を もどすだけ（M7 §3.3 と 同じ） */
export const ANIMAL_HINT_STEPS = 120;

/** チップに そえる 絵（'full' = おなかいっぱい・'carry' = だっこ。専用 の 絵 が できるまで にわとり で かわり） */
export type AnimalHintArt = ItemId | 'heart' | 'chicken' | 'chickenRibbon' | 'sun';

const R = ruby('右', 'みぎ');

/** 文（漢字は ふりがな付き。HTML）と 添える絵（左から）。仕様 §3.1。数 8 は 設定 `animalFriendMax` の 初期値 */
type HintView = { html: string; art: ReadonlyArray<AnimalHintArt> };
/**
 * LIVE-2: 合図 9 つ（`AnimalLive2Hint`）の 文・絵 は C が ここ に 足す（仕様 §3.1）。
 * 足し おわったら 型 を `Record<AnimalWindowHint, HintView>` に して `Partial` を はずす。
 */
export const ANIMAL_HINT_VIEW: Readonly<Record<AnimalLive1Hint, HintView> & Partial<Record<AnimalLive2Hint, HintView>>> = {
  feedHint: { html: `むし を もって ${R}クリック で あげよう`, art: ['mushi', 'chicken'] },
  fullHint: { html: 'おなか いっぱい。すこし まってね', art: ['chicken', 'sun'] },
  friendFull: { html: 'なかま は 8 わ まで', art: ['chickenRibbon'] },
  treeEmpty: { html: 'むし は おやすみ。ほか の き を さがそう', art: ['leaves', 'log'] },
  netHint: { html: `あみ で き を ねらって ${R}クリック`, art: ['mushi_ami', 'leaves'] },
  carryHint: { html: `${R}クリック を ながく おす と だっこ`, art: ['chickenRibbon'] },
  carryWild: { html: 'なかま に なったら だっこ できる よ', art: ['chickenRibbon'] },
  cantPutHere: { html: 'ここ には おろせない', art: ['chicken', 'stone'] },
};

/** 出ている合図を持つ（DOM なしでテストできる） */
export class AnimalHintModel {
  private hint: AnimalWindowHint | null = null;
  private left = 0;
  shown = 0;

  show(kind: AnimalHintKind): void {
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
    return this.hint;
  }
  stepsLeft(): number {
    return this.left;
  }
}
