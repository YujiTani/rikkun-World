import { TOOL_DEFAULTS } from '../tools/config';

/**
 * M4 の画面・音の数値を 1 か所に（仕様 M4 §3, §4.5）。
 * settings の名前（pickupLogTicks など）と同じ名前。つなぎ込みで settings とつなぐ。
 */
export interface CraftUiSettings {
  /** 拾ったときの ログ: 1 行が消えるまで（ステップ）・行の数 */
  pickupLogTicks: number;
  pickupLogMax: number;
  /** ログの最後のうすくなるステップ数 */
  pickupLogFadeTicks: number;
  /** かまど: 焼く時間（ステップ）。やく画面の棒の長さ */
  bakeTicks: number;
  /** ねんりょうを使う順 */
  fuelOrder: readonly string[];
  /** かまど の火の明るさの波（1 秒あたりの回数。3 未満） */
  flameHz1: number;
  flameHz2: number;
  /** かまど の けむり: 1 秒に出す数・ういている秒・上がる速さ（ブロック/秒）・いちどに出せる数 */
  smokePerSecond: number;
  smokeLife: number;
  smokeRise: number;
  smokeMax: number;
  /** 火が見える かまど の数 */
  fireMaxFurnaces: number;
  /** パチパチが鳴る距離（ブロック）と間隔（秒） */
  crackleRange: number;
  crackleMinInterval: number;
  crackleMaxInterval: number;
  /** カードの「光」の周期（秒） */
  glowSeconds: number;
  /** つくれる マークの はね（秒） */
  hintHopSeconds: number;
}

export const CRAFT_UI_SETTINGS: CraftUiSettings = {
  pickupLogTicks: 180,
  pickupLogMax: 5,
  pickupLogFadeTicks: 30,
  bakeTicks: 60,
  fuelOrder: ['coal_ore', 'oil', 'log'],
  flameHz1: 1.7,
  flameHz2: 2.4,
  smokePerSecond: 5,
  smokeLife: 1.6,
  smokeRise: 0.9,
  smokeMax: 48,
  fireMaxFurnaces: 8,
  crackleRange: 8,
  crackleMinInterval: 0.12,
  crackleMaxInterval: 0.35,
  glowSeconds: 1.5,
  hintHopSeconds: 0.35,
};

/** ツールチップに出す道具・武器の数（M4 §4.3, §4.5。settings の toolPower などとつなぐ） */
export interface ToolNumbers {
  toolPower: Record<string, number>;
  toolLevel: Record<string, number>;
  weaponDamage: Record<string, number>;
  arrowDamage: number;
}

/** 数は tools/config.ts の TOOL_DEFAULTS と同じもの（写さず読む。tools/config.ts は型だけを読む葉のファイルなので循環しない） */
export const TOOL_NUMBERS: ToolNumbers = {
  toolPower: { ...TOOL_DEFAULTS.toolPower },
  toolLevel: { ...TOOL_DEFAULTS.toolLevel },
  weaponDamage: { ...TOOL_DEFAULTS.weaponDamage },
  arrowDamage: TOOL_DEFAULTS.arrowDamage,
};
