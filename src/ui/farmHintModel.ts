import type { FarmEvent, FarmHintKind } from '../contracts';
import type { ItemId } from '../contracts';
import { ruby } from './text';

/** 合図（M7 §3.3）。チップは 120 ステップで消える。同じ合図は 出ているあいだ もう出さない（のこり時間を最初にもどすだけ） */
export const FARM_HINT_STEPS = 120;

/** 文（漢字は ふりがな付き。HTML）と 添える絵（左から） */
export const FARM_HINT_VIEW: Readonly<Record<FarmHintKind, { html: string; art: ReadonlyArray<ItemId | 'heart'> }>> = {
  till: {
    html: `さきに くわ で ${ruby('土', 'つち')}を たがやして ${ruby('畑', 'はたけ')}に しよう`,
    art: ['kuwa', 'farmland'],
  },
  full: { html: 'ハート が いっぱい だから いまは たべられないよ', art: ['heart'] },
};

/** 出ている合図を持つ（DOM なしでテストできる） */
export class FarmHintModel {
  private hint: FarmHintKind | null = null;
  private left = 0;
  /** 出し直した回数ではなく「出した」回数（テスト用）。のこり時間を もどしただけ でも ふえる */
  shown = 0;

  show(kind: FarmHintKind): void {
    this.hint = kind;
    this.left = FARM_HINT_STEPS;
    this.shown++;
  }

  /** 出来事の列から 合図だけ拾う */
  feed(events: readonly FarmEvent[]): void {
    for (const e of events) if (e.type === 'hint') this.show(e.hint);
  }

  /** 1 ステップ */
  step(): void {
    if (this.left <= 0) return;
    if (--this.left <= 0) this.hint = null;
  }

  current(): FarmHintKind | null {
    return this.hint;
  }
  stepsLeft(): number {
    return this.left;
  }
}
