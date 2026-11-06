import { DEFAULT_CAMERA_CONFIG } from '../camera/config';

/**
 * COOP-1（docs/design/COOP-1.md §9）の 数を 1 か所に 集めた 表。単位は 各行の コメント。
 * 数を 変えるときは 仕様書（デザイン）と 相談する。
 */
export const DUO_TUNING = {
  /** 距離メーターが いちばん 長くなる 2 人の 距離（マス）。これより 遠くても 長さは 止まる（§9.4） */
  meterFullTiles: 48,
  /** 色の 段が 上がる 距離（マス）。[ふつう→1 段目, 1 段目→2 段目]（§9.2） */
  tierUpAt: [16, 20] as const,
  /** 色の 段が 下がる 距離（マス）。[1 段目→ふつう, 2 段目→1 段目]（§9.2。上りと 幅を 3 マス あける） */
  tierDownAt: [13, 17] as const,
  /** 1 人のときの カメラの 距離（マス。camera/config.ts の thirdPersonDistance と 同じ） */
  cameraSolo: DEFAULT_CAMERA_CONFIG.thirdPersonDistance as number,
  /** 2 人（1 画面・ルーペ）のときの カメラの 距離（マス。§9.1） */
  cameraDuo: 6.0,
  /** カメラの 距離が かわり おわるまで（ステップ。30 = 0.5 秒） */
  cameraEaseSteps: 30,
  /** 「やめる」を 長押しして やめるまで（ステップ。120 = 2 秒） */
  quitHoldSteps: 120,
  /** パッドが ぬけたまま 自動で やめるまで（ステップ。3600 = 60 秒） */
  padLostSteps: 3600,
  /** 2P が 出る 所: 1P の 右へ（マス。§9.5） */
  joinOffsetTiles: 2,
  /** 横が どこも ふさがっている とき 1P の 真上に 出す 高さ（マス） */
  joinAboveTiles: 2,
  /** 2 人のとき ホットバーを 半分の 幅の 何割に おさめるか（倍。§3.1） */
  hotbarFit: 0.9,
  /** 距離メーターの 棒が いちばん 長いときの 画面の 幅に 対する 割合（§9.4） */
  meterWidthRatio: 0.3,
  /** 2P の 頭の 上の ▼ の 高さ（足もとから マス） */
  markHeightTiles: 2.35,
} as const;

/**
 * 1P・2P の 色（#rrggbb）。アートの 3 案から オーナーが 選ぶまでの 仮の 色（§3）。
 * ルーペ・メーターの 段の 色は 白 → 黄 → オレンジ（赤は ダメージと まざるので 使わない）。
 */
export const DUO_COLORS = {
  p1: '#3a8dff',
  p2: '#ff5fa2',
  /** 色の 段ごとの 色（0 = ふつう・1 = 1 段目・2 = 2 段目） */
  tier: ['#ffffff', '#ffd23f', '#ff9a1f'] as const,
} as const;
