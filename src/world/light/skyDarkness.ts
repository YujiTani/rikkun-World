import { LIGHT_CONFIG } from './config';

/**
 * いまの時刻で空の光を何段弱めるか（昼 0 〜 夜 11）。
 * Sky が毎ステップ書き、ブロックの材料（uniform）と WorldLight.level() が読む。
 * 値を入れ物（uniform）で持つので、毎フレームのメッシュ作り直しはいらない。
 * 夜の度合い nt（= 段数 ÷ nightDarken、0 昼〜1 夜）も 同じ入れ物で持つ（#76。夜の倍率の材料が読む）。
 */
export class SkyDarkness {
  readonly uniform = { value: 0 };
  /** 夜の度合い nt（0〜1）。value を書くと 一緒に変わる */
  readonly nightUniform = { value: 0 };
  get value(): number {
    return this.uniform.value;
  }
  set value(v: number) {
    this.uniform.value = v;
    this.nightUniform.value = Math.max(0, Math.min(1, v / LIGHT_CONFIG.nightDarken));
  }
  get night(): number {
    return this.nightUniform.value;
  }
}

export const skyDarkness = new SkyDarkness();
