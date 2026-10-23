/**
 * みのった作物・やせいの やさい の明るさの下限（M7 §3.2。`farmRipeMinBrightness`）。
 * シェーダーが読む入れ物。ブロックの光の計算（M4）には入れない。まわりは照らさない。
 */
export const ripeMinBrightness = { value: 0 };

export function setRipeMinBrightness(v: number): void {
  ripeMinBrightness.value = v;
}
