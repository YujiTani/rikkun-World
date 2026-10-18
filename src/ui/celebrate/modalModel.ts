import type { AchievementId, AchievementShow } from '../../contracts';
import type { CelebrateSettings } from './config';

export interface ModalView {
  open: boolean;
  /** 出てからの ステップ */
  age: number;
  /** きえるまでの ステップ（出た ときは achieveToastTicks） */
  leftSteps: number;
  mainId: AchievementId | null;
  ids: AchievementId[];
  /** 行の 一覧は 出さない */
  rows: number;
  /** のこりの 実績の 数（`ほか N こ`） */
  more: number;
  /** ボタンは ない（O8） */
  buttonEnabled: false;
  waitLeft: 0;
  flashPeriods: number[];
}

/**
 * 実績の おしらせ（画面の 上の 帯。WEAPON-7 §2.6 (1)）の 中の 時間。DOM を知らない。
 * - ゲームを 止めない・ボタンなし。`achieveToastTicks`（240）ステップで 自動で きえる。
 * - `step` は きえた ステップに 見せた id を 返す（それ以外は null）。
 */
export class ModalModel {
  private show: AchievementShow | null = null;
  private age = 0;

  constructor(private readonly cfg: () => CelebrateSettings) {}

  open(show: AchievementShow): boolean {
    if (this.show) return false;
    this.show = { ids: [...show.ids], mainId: show.mainId, more: show.more };
    this.age = 0;
    return true;
  }

  /** テストの 準備用: 出している おしらせを 出しなおす（時間を 0 に もどす） */
  restart(): void {
    this.age = 0;
  }

  isOpen(): boolean {
    return this.show !== null;
  }

  ageSteps(): number {
    return this.age;
  }

  total(): number {
    return this.cfg().achieveToastTicks;
  }

  /** 1 ステップ進める（amount = 画面ステップ）。きえた ステップに 見せた id の列を返す */
  step(amount = 1): AchievementId[] | null {
    if (!this.show) return null;
    this.age += amount;
    if (this.age >= this.total() - 1e-9) {
      const ids = [...this.show.ids];
      this.show = null;
      return ids;
    }
    return null;
  }

  view(flashPeriods: number[]): ModalView {
    const s = this.show;
    return {
      open: s !== null,
      age: s ? Math.floor(this.age + 1e-9) : 0,
      leftSteps: s ? Math.max(0, this.total() - Math.floor(this.age + 1e-9)) : 0,
      mainId: s ? s.mainId : null,
      ids: s ? [...s.ids] : [],
      rows: 0,
      more: s ? Math.max(0, s.more, s.ids.length - 1) : 0,
      buttonEnabled: false,
      waitLeft: 0,
      flashPeriods,
    };
  }
}
