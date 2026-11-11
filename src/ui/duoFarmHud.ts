import type { FarmAim, FarmHintKind } from '../contracts';
import { FarmAimHud } from './farmAim';
import { FarmHint } from './farmHint';
import './duoFarmHud.css';

/**
 * COOP-1 5a（docs/design/COOP-1.md §3.7 (b)）: 2P の 半分に 出す 畑の 合図の チップ（`duo-farm-hint-p2`）と 作物の しるし（`duo-farm-aim-p2`）。
 * 中身は 1P の `FarmHint`・`FarmAimHud` と 同じ 部品の 2 つ目。置き場は duoFarmHud.css（2 人の とき 1P の 物も 1P の 半分の 中）。
 * 2P が 参加して いる あいだ だけ 作り、やめたら `dispose()` で 取りのぞく。
 */
export class DuoFarmHud {
  /** 2P の チップ（`hint.model.current()` が `duo.farmHint(2)`） */
  readonly hint: FarmHint;
  private readonly aim: FarmAimHud;

  constructor(parent: HTMLElement) {
    this.hint = new FarmHint(parent, '-p2');
    this.hint.el.setAttribute('data-testid', 'duo-farm-hint-p2');
    this.aim = new FarmAimHud(parent, '-p2');
    this.aim.el.setAttribute('data-testid', 'duo-farm-aim-p2');
  }

  show(kind: FarmHintKind): void {
    this.hint.show(kind);
  }

  /** 毎ステップ: チップの 時間を 1 すすめ、しるしを 書く（`aim` が null なら かくす。見せて よいか は 呼ぶ 側が きめる） */
  step(aim: FarmAim | null, label: string): void {
    this.hint.step();
    this.aim.update(aim, label);
  }

  dispose(): void {
    this.hint.el.remove();
    this.aim.el.remove();
  }
}
