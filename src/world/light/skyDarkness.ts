/**
 * いまの時刻で空の光を何段弱めるか（昼 0 〜 夜 11）。
 * Sky が毎ステップ書き、ブロックの材料（uniform）と WorldLight.level() が読む。
 * 値を入れ物（uniform）で持つので、毎フレームのメッシュ作り直しはいらない。
 */
export class SkyDarkness {
  readonly uniform = { value: 0 };
  get value(): number {
    return this.uniform.value;
  }
  set value(v: number) {
    this.uniform.value = v;
  }
}

export const skyDarkness = new SkyDarkness();
