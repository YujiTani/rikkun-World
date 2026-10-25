/**
 * W2 の設定の初期値。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import { SAMURAI_ITEM_IDS } from '../content/items/ids';
import { registryBladeReach, registryBladeTrail, registryBowDamage, registryWear } from '../content/items/registry';
import type { ItemId } from '../contracts/items';
import type { BladeComboSettings, LegendaryDef, W2Settings } from '../contracts/weapons';
import { LEGENDARY_DEFAULTS, cloneLegendary } from './legendaryDefaults';

export const W2_SETTING_DEFAULTS: Readonly<W2Settings> = {
  bladeTech: {
    thrust: { startup: 4, active: 2, recovery: 35 },
    kesa: { startup: 28, active: 6, recovery: 72 },
    kiriage: { startup: 19, active: 3, recovery: 30 },
  },
  stanceSwitchTicks: 8,
  bladeBufferTicks: 8,
  bladeMoveMul: { thrust: 0, kesaStartupActive: 0, kesaRecovery: 0, kiriage: 0 },
  bladeAdvance: {
    thrust: { ticks: [2, 2, 1, 1, 3, 11, 4, 4, 4, 4, 5], advance: [0, 0.08, 0.255, 0.26, 0.29, 0.32, 0.285, 0.241, 0.16, 0.073, 0.002], step: 0 },
    kesa: { ticks: [4, 4, 6, 5, 4, 5, 2, 2, 2, 5, 28, 8, 8, 8, 8, 7], advance: [0, 0, 0, 0.02, 0.04, 0.08, 0.4, 1.4, 2.4, 3.1, 3.1, 3.1, 3.1, 3.1, 3.1, 3.1], step: 3.1 },
    kiriage: { ticks: [3, 4, 6, 3, 3, 1, 2, 7, 6, 5, 4, 4, 4], advance: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], step: 0 },
  },
  bladeCombo: {
    items: ['crystal_katana', 'raijin_ken', 'fujin_ken', 'niji'],
    order: { chudan: ['thrust', 'kiriage', 'kesa'], gedan: ['kiriage', 'thrust', 'kesa'], jodan: ['kesa'] },
    stepStartup: { thrust: 4, kiriage: 12, kesa: 20 },
    follow: { thrust: 14, kiriage: 12, kesa: 12 },
    step2Advance: {
      kiriage: { ticks: [3, 4, 6, 3, 3, 1, 2, 7, 6, 5, 4, 4, 4], advance: [0, 0, 0, 0.1, 0.4, 1.0, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4], step: 1.4 },
      thrust: { ticks: [2, 2, 1, 1, 3, 11, 4, 4, 4, 4, 5], advance: [0, 0.5, 1.1, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4], step: 1.4 },
    },
  },
  bladeAimReach: 4.5,
  // 金シリーズ・レジェンダリー 3 つの 分は 登録表（content/items/gold.ts・legend.ts）から
  bladeReach: registryBladeReach(), // 刀の 届く 長さは ぜんぶ 登録表（content/items/weapons.ts・legend.ts・gold.ts）から
  bladeShape: {
    thrust: { length: 2.2, radius: 0.2 },
    kesa: { halfAngleDeg: 75, rMin: 0.3, rMax: 2.2, yMin: -0.5, yMax: 2.6 },
    kiriage: { halfAngleDeg: 45, rMin: 0.3, rMax: 2.2, yMin: -0.3, yMax: 6.0 },
  },
  bladeDamageMul: { thrust: 0.75, kiriage: 1.15, kesa: 2.5 },
  bladeKnock: { thrust: [0.8, 0], kesa: [6, 3], kiriage: [1.0, 7] },
  bowStageTicks: [10, 25, 40],
  bowSpeed: [12, 20, 28],
  bowDamage: [1, 2, 3],
  bowDamageByItem: { ...registryBowDamage() },
  bowKnock: [0.5, 1.0, 1.5],
  arrowGravity: 20,
  arrowLifeTicks: 600,
  bowNockTicks: 10,
  arrowStuckTicks: 1800,
  arrowStuckMax: 32,
  arrowPickupRange: [1.2, 2],
  bowMoveMul: 0.5,
  bowBend: { pull: [0.4, 0.7, 1.0], bendDeg: [12, 22, 32], blendTicks: 6 },
  // つるはし・おの・刀・なぎなた・ゆみ・かぶと など（M4）・くわ（M7）・忍者・侍装備（10000）・雷神剣・風神剣・虹（10000。つくれず ヌシでしか 手に 入らない 武器だけの 例外）・きんの 装備（500）は ぜんぶ 登録表（content/items/）から
  toolDurability: registryWear(),
  toolWear: {
    pickaxe: { block: 1, hit: 2 },
    blade: { block: 2, hit: 1 },
    bow: { shot: 1 },
    kuwa: { till: 1, block: 2, hit: 2 },
    armorDiv: 4,
  },
  wearLowRatio: 0.1,
  legendary: LEGENDARY_DEFAULTS as LegendaryDef[],
  // SAMURAI-1 §4.2: 武器 3 行（雷神剣・風神剣・虹）の あとに 侍装備 4 行（陣笠・羽織・手甲・下駄）。ぜんぶ weight 1（はじめての ヌシで 侍装備は 4/7）
  nushiDrops: [
    ...LEGENDARY_DEFAULTS.map((d) => ({ item: d.item, weight: 1 })),
    ...SAMURAI_ITEM_IDS.map((item) => ({ item: item as ItemId, weight: 1 })),
  ],
  legendaryChargeWalk: 0.5,
  shiningCamDistance: 14,
  // 刀・なぎなた・雷神剣・風神剣・虹・きんの かたなの 軌跡は ぜんぶ 登録表（content/items/weapons.ts・legend.ts・gold.ts）から
  bladeTrail: registryBladeTrail(),
  bladeFaceAssistDeg: 30,
  thrustTiltMaxDeg: 45,
  punchShape: { halfAngleDeg: 45, yMin: -0.5, yMax: 3.0 },
  bladeTrailShape: {
    widthRatio: 0.45,
    minWidth: 0.1,
    lifeSteps: 9,
    segPerStep: 6,
    maxSegs: 36,
    bandEdges: [1 / 6, 1 / 2, 5 / 6],
    bandAlpha: [1, 0.85, 0.5, 0.22],
    fadeAges: [2.25, 4.5, 6.75],
    starAt: [0.25, 0.55, 0.85],
    starMaxAge: 8.55,
  },
  bladeTrailWindow: { thrust: [2, 6], kesa: [28, 34], kiriage: [19, 22] },
  parryTicks: { ready: 2, guard: 18, recover: 20 },
  parryEarlyTicks: 12,
  parryKimeTicks: 8,
  parryEarlyMul: 0.5,
  parryArcDeg: 90,
  parrySlow: { ticks: 6, scale: 0.25 },
  parryGlowTicks: 20,
  staggerTicks: 90,
  staggerDamageMul: 2,
  reflectFireball: { speed: 10, range: 8, damageMul: 1 },
};

/** 設定の 入れ物を作る（毎回 ふかい コピー。つなぎ込みが `createSettingsHook` の extras に渡す） */
export function createW2Settings(): W2Settings {
  const d = W2_SETTING_DEFAULTS;
  return {
    bladeTech: {
      thrust: { ...d.bladeTech.thrust },
      kesa: { ...d.bladeTech.kesa },
      kiriage: { ...d.bladeTech.kiriage },
    },
    stanceSwitchTicks: d.stanceSwitchTicks,
    bladeBufferTicks: d.bladeBufferTicks,
    bladeMoveMul: { ...d.bladeMoveMul },
    bladeAdvance: {
      thrust: { ...d.bladeAdvance.thrust, ticks: [...d.bladeAdvance.thrust.ticks], advance: [...d.bladeAdvance.thrust.advance] },
      kesa: { ...d.bladeAdvance.kesa, ticks: [...d.bladeAdvance.kesa.ticks], advance: [...d.bladeAdvance.kesa.advance] },
      kiriage: { ...d.bladeAdvance.kiriage, ticks: [...d.bladeAdvance.kiriage.ticks], advance: [...d.bladeAdvance.kiriage.advance] },
    },
    bladeCombo: {
      items: [...d.bladeCombo.items],
      order: { chudan: [...d.bladeCombo.order.chudan], gedan: [...d.bladeCombo.order.gedan], jodan: [...d.bladeCombo.order.jodan] },
      stepStartup: { ...d.bladeCombo.stepStartup },
      follow: { ...d.bladeCombo.follow },
      step2Advance: Object.fromEntries(
        Object.entries(d.bladeCombo.step2Advance).map(([k, v]) => [k, { ...v, ticks: [...v.ticks], advance: [...v.advance] }]),
      ) as BladeComboSettings['step2Advance'],
    },
    bladeAimReach: d.bladeAimReach,
    bladeReach: { ...d.bladeReach },
    bladeShape: {
      thrust: { ...d.bladeShape.thrust },
      kesa: { ...d.bladeShape.kesa },
      kiriage: { ...d.bladeShape.kiriage },
    },
    bladeDamageMul: { ...d.bladeDamageMul },
    bladeKnock: { thrust: [...d.bladeKnock.thrust], kesa: [...d.bladeKnock.kesa], kiriage: [...d.bladeKnock.kiriage] },
    bowStageTicks: [...d.bowStageTicks],
    bowSpeed: [...d.bowSpeed],
    bowDamage: [...d.bowDamage],
    bowDamageByItem: Object.fromEntries(Object.entries(d.bowDamageByItem).map(([k, v]) => [k, [...v!]])) as W2Settings['bowDamageByItem'],
    bowKnock: [...d.bowKnock],
    arrowGravity: d.arrowGravity,
    arrowLifeTicks: d.arrowLifeTicks,
    bowNockTicks: d.bowNockTicks,
    arrowStuckTicks: d.arrowStuckTicks,
    arrowStuckMax: d.arrowStuckMax,
    arrowPickupRange: [...d.arrowPickupRange],
    bowMoveMul: d.bowMoveMul,
    bowBend: { pull: [...d.bowBend.pull], bendDeg: [...d.bowBend.bendDeg], blendTicks: d.bowBend.blendTicks },
    toolDurability: { ...d.toolDurability },
    toolWear: {
      pickaxe: { ...d.toolWear.pickaxe },
      blade: { ...d.toolWear.blade },
      bow: { ...d.toolWear.bow },
      kuwa: { ...d.toolWear.kuwa },
      armorDiv: d.toolWear.armorDiv,
    },
    wearLowRatio: d.wearLowRatio,
    legendary: d.legendary.map(cloneLegendary),
    nushiDrops: d.nushiDrops.map((r) => ({ ...r })),
    legendaryChargeWalk: d.legendaryChargeWalk,
    shiningCamDistance: d.shiningCamDistance,
    bladeTrail: Object.fromEntries(Object.entries(d.bladeTrail).map(([k, v]) => [k, { ...v }])) as W2Settings['bladeTrail'],
    bladeFaceAssistDeg: d.bladeFaceAssistDeg,
    thrustTiltMaxDeg: d.thrustTiltMaxDeg,
    punchShape: { ...d.punchShape },
    bladeTrailShape: {
      ...d.bladeTrailShape,
      bandEdges: [...d.bladeTrailShape.bandEdges],
      bandAlpha: [...d.bladeTrailShape.bandAlpha],
      fadeAges: [...d.bladeTrailShape.fadeAges],
      starAt: [...d.bladeTrailShape.starAt],
    },
    bladeTrailWindow: { thrust: [...d.bladeTrailWindow.thrust], kesa: [...d.bladeTrailWindow.kesa], kiriage: [...d.bladeTrailWindow.kiriage] },
    parryTicks: { ...d.parryTicks },
    parryEarlyTicks: d.parryEarlyTicks,
    parryKimeTicks: d.parryKimeTicks,
    parryEarlyMul: d.parryEarlyMul,
    parryArcDeg: d.parryArcDeg,
    parrySlow: { ...d.parrySlow },
    parryGlowTicks: d.parryGlowTicks,
    staggerTicks: d.staggerTicks,
    staggerDamageMul: d.staggerDamageMul,
    reflectFireball: { ...d.reflectFireball },
  };
}
