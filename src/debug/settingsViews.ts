// 窓口 settings の 見え方（main.ts から 移した）。設定の 入れ物を そのまま 読み書きできる 形に する。
import type { DigSystemImpl } from '../dig';

/** 同じ名前の設定を 2 か所に書く（knockback はプレイヤーと妖怪の両方） */
export function sharedSettingsView(name: string, targets: object[]): object {
  const view = {};
  Object.defineProperty(view, name, {
    enumerable: true,
    get: () => (targets[0] as Record<string, number>)[name],
    set: (v: number) => {
      for (const t of targets) (t as Record<string, number>)[name] = v;
    },
  });
  return view;
}

/** 設定の入れ物のうち、配列（fuelOrder）と除く名前を外した見え方（そのまま読み書きできる） */
export function settingsViewOf(obj: object, exclude: readonly string[] = []): object {
  const view = {};
  for (const n of Object.keys(obj)) {
    if (n === 'fuelOrder' || exclude.includes(n)) continue;
    Object.defineProperty(view, n, {
      enumerable: true,
      get: () => (obj as Record<string, unknown>)[n],
      set: (v) => ((obj as Record<string, unknown>)[n] = v),
    });
  }
  return view;
}

/** dig.config のうち settings に出す名前だけを、そのまま読み書きできる見え方にする（digResumeTicks は出さない） */
export function digSettingsView(cfg: DigSystemImpl['config']): object {
  const names = [
    'reach', 'hardness', 'harvestLevel', 'handPower', 'handLevel', 'digCooldown',
    'placeRepeatTicks', 'digDecayRate', 'crackStages', 'rarity', 'dropMax',
  ] as const;
  const view = {};
  for (const n of names) {
    Object.defineProperty(view, n, { enumerable: true, get: () => cfg[n], set: (v) => ((cfg as unknown as Record<string, unknown>)[n] = v) });
  }
  return view;
}
