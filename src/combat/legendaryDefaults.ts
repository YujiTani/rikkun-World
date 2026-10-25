/**
 * レジェンダリーの初期値。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import { registryLegend } from '../content/items/registry';
import type { LegendaryDef } from '../contracts/weapons';

/** レジェンダリーの 初期値（雷神剣・風神剣・虹）。値は 登録表（content/items/legend.ts）の `legend` から。写して 作るので 登録表の 物とは 別の 入れ物 */
export const LEGENDARY_DEFAULTS: readonly LegendaryDef[] = registryLegend().map(cloneLegendary);

export function cloneLegendary(d: LegendaryDef): LegendaryDef {
  return {
    item: d.item,
    power: Array.isArray(d.power) ? ([...d.power] as [number, number]) : d.power,
    charge: d.charge
      ? d.charge.kind === 'lightning' || d.charge.kind === 'spiral'
        ? { ...d.charge, knock: [...d.charge.knock] as [number, number] }
        : { ...d.charge, push: [...d.charge.push] as [number, number] }
      : null,
    onAttack: d.onAttack.map((a) => (a.kind === 'wave' ? { ...a, knock: [...a.knock] as [number, number] } : { ...a })),
    passive: d.passive.map((p) => ({ ...p })),
  };
}
