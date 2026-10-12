import type { AchievementId, AchievementShow } from '../../contracts';
import type { CelebrateSettings } from './config';

export interface ModalView {
  open: boolean;
  mainId: AchievementId | null;
  ids: AchievementId[];
  rows: number;
  more: number;
  buttonEnabled: boolean;
  waitLeft: number;
  flashPeriods: number[];
}

export type ModalCloseResult = { ok: boolean; reason: null | 'notYet' | 'notOpen' };

/**
 * おめでとう画面の中の時間と、とじる のきまり（§2.6 (3)）。DOM を知らない。
 * - 中の時間は おめでとう画面のあいだだけ 1 ステップで 1 進む。
 * - 閉じるのは とじる ボタンを「押して はなした」ときだけ（押せる前の押しは 無視。出る前から押していたマウスは はなしても閉じない）。
 */
export class ModalModel {
  private show: AchievementShow | null = null;
  private age = 0;
  private armed = false;
  private readyFired = false;

  constructor(private readonly cfg: () => CelebrateSettings) {}

  open(show: AchievementShow): boolean {
    if (this.show) return false;
    this.show = { ids: [...show.ids], mainId: show.mainId, more: show.more };
    this.age = 0;
    this.armed = false;
    this.readyFired = false;
    return true;
  }

  isOpen(): boolean {
    return this.show !== null;
  }

  ageSteps(): number {
    return this.age;
  }

  /** 1 ステップ進める。「押せるようになった」瞬間に true */
  step(): boolean {
    if (!this.show) return false;
    this.age += 1;
    if (!this.readyFired && this.age >= this.cfg().achieveCloseDelay) {
      this.readyFired = true;
      return true;
    }
    return false;
  }

  buttonEnabled(): boolean {
    return this.show !== null && this.age >= this.cfg().achieveCloseDelay;
  }

  /** とじる ボタンの上で マウスを押した（押せるときだけ「押した」と覚える） */
  buttonDown(): void {
    this.armed = this.buttonEnabled();
  }

  /** マウスをはなした。onButton = ボタンの上か。閉じるなら、見せた id を返す */
  pointerUp(onButton: boolean): AchievementId[] | null {
    const was = this.armed;
    this.armed = false;
    if (!was || !onButton || !this.buttonEnabled()) return null;
    return this.finish();
  }

  /** テストの窓口 `achievements.close()` */
  press(): { result: ModalCloseResult; shown: AchievementId[] | null } {
    if (!this.show) return { result: { ok: false, reason: 'notOpen' }, shown: null };
    if (!this.buttonEnabled()) return { result: { ok: false, reason: 'notYet' }, shown: null };
    return { result: { ok: true, reason: null }, shown: this.finish() };
  }

  private finish(): AchievementId[] {
    const ids = this.show ? [...this.show.ids] : [];
    this.show = null;
    this.armed = false;
    return ids;
  }

  /** 行に出す id（のこりの実績を行の上限まで。主役はのぞく） */
  rowIds(): AchievementId[] {
    if (!this.show) return [];
    const rows = this.cfg().achieveModalRows;
    const rest = this.show.ids.filter((i) => i !== this.show!.mainId);
    return rest.slice(0, rows);
  }

  view(flashPeriods: number[]): ModalView {
    const s = this.show;
    const rows = this.rowIds().length;
    return {
      open: s !== null,
      mainId: s ? s.mainId : null,
      ids: s ? [...s.ids] : [],
      rows,
      more: s ? Math.max(0, s.more, s.ids.length - 1 - rows) : 0,
      buttonEnabled: this.buttonEnabled(),
      waitLeft: s ? Math.max(0, this.cfg().achieveCloseDelay - this.age) : 0,
      flashPeriods,
    };
  }
}
