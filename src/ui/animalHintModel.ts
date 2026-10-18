import type { AnimalEvent, AnimalHintKind, ItemId } from '../contracts';
import { ruby } from './text';

/** 合図（LIVE-1 §3.1）。チップは 120 ステップで消える。同じ合図は のこり時間を もどすだけ（M7 §3.3 と 同じ） */
export const ANIMAL_HINT_STEPS = 120;

/** チップに そえる 絵 */
export type AnimalHintArt = ItemId | 'heart' | 'chicken' | 'chickenRibbon' | 'sun';

/** 文（漢字は ふりがな付き。HTML）と 添える絵（左から）。数 8 は 設定 `animalFriendMax` の 初期値 */
export const ANIMAL_HINT_VIEW: Readonly<Record<AnimalHintKind, { html: string; art: ReadonlyArray<AnimalHintArt> }>> = {
  feedHint: {
    html: `やさい を もって ${ruby('右', 'みぎ')}クリック で あげよう`,
    art: ['tomato', 'chicken'],
  },
  eggLater: { html: 'たまご は また あした', art: ['egg', 'sun'] },
  friendFull: { html: 'なかま は 8 わ まで', art: ['chickenRibbon'] },
};

/** 出ている合図を持つ（DOM なしでテストできる） */
export class AnimalHintModel {
  private hint: AnimalHintKind | null = null;
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

  current(): AnimalHintKind | null {
    return this.hint;
  }
  stepsLeft(): number {
    return this.left;
  }
}
