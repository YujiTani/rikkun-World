import { DEFAULT_CAMERA_CONFIG } from '../camera/config';

/**
 * COOP-1（docs/design/COOP-1.md §9）の 数を 1 か所に 集めた 表。単位は 各行の コメント。
 * 数を 変えるときは 仕様書（デザイン）と 相談する。
 */
export const DUO_TUNING = {
  /** 距離メーターが いちばん 長くなる 2 人の 距離（マス）。これより 遠くても 長さは 止まる（§9.4） */
  meterFullTiles: 48,
  /** 1 人のときの カメラの 距離（マス。camera/config.ts の thirdPersonDistance と 同じ） */
  cameraSolo: DEFAULT_CAMERA_CONFIG.thirdPersonDistance as number,
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

  // ---- 作業 2（#399）・3e（#422）。値は 仕様 §2.4・§5・§7.2・§9.1〜9.3 ----
  /** 見せ方の 長さ（ステップ）: 分割へ/から（24 = 0.4 秒）・動きを 減らす 設定（9 = 0.15 秒） */
  transitionSteps: { split: 24, reduced: 9 } as const,
  /** 輪を 2 つに する 距離（マス。これより 遠い）と、1 つに 戻す 距離（これより 近い） */
  ringsUpAt: 48,
  ringsDownAt: 32,
  /** 持つ 列の 上限（1 人の 441 の 1.35 倍） */
  layoutMaxColumns: 595,
  /** 軽くする 工夫(2P が いる あいだ): 小ブロックを 細かく 描く 半径（マス） */
  lightMicroRadiusTiles: 16,
  /** 軽くする 工夫を 元に 戻すまで（ステップ。120 = 2 秒） */
  lightRestoreSteps: 120,
  /** 2P が いる あいだの 各カメラの 距離（マス。1P・2P 同じ。§9.1） */
  cameraSplit: 5.0,
  /** 分割の 線の 太さ（px。1280 幅のとき。§9.1） */
  splitLinePx: 4,
  /** 輪が 小さくなった とき、1 仕事で 捨てる 列の 数（1 コマで ぜんぶは 捨てない） */
  layoutDropPerJob: 4,
  /** 2P の 頭の 上の「？」の 高さ（足もとから マス） */
  questionHeightTiles: 2.9,

  // ---- 作業 3a（#416）。値は 仕様 §9.5 ----
  /** 2P が 倒れてから 1P の 横に 戻るまで（ステップ。180 = 3 秒） */
  p2ReturnSteps: 180,

  // ---- 作業 3e（#422）。相手の 向きの 矢印。値は 仕様 §2.4・§9.3 ----
  /** 相手が 自分の 半分の 内側 この 割合の 外 → 矢印が 出る 数えに 入る（NDC の 絶対値の 大きい 方。0.9 = 90%） */
  arrowOutRatio: 0.9,
  /** 相手が 内側 この 割合の 中 → 矢印が 消える 数えに 入る（0.8 = 80%） */
  arrowInRatio: 0.8,
  /** 矢印が 出る・消える までの つづき（ステップ。18 = 0.3 秒） */
  arrowHoldSteps: 18,
  /** 2 人の 距離が これ 以下 なら 矢印を 出さない・消す（マス） */
  arrowNearTiles: 4,
  /** 矢印を 半分の ふち・まん中の 線から 内側へ おく すきま（px） */
  arrowEdgePx: 16,
  /** 矢印を 置かない 上の 帯（画面の 高さに 対する 割合。メーター・お知らせ） */
  arrowTopRatio: 0.12,
  /** 矢印を 置いて よい 下の 限り（画面の 高さに 対する 割合。これより 下 22% は ホットバー） */
  arrowBottomRatio: 0.78,
  /** 矢印の 三角の 高さ（画面の 高さに 対する 割合） */
  arrowHeightRatio: 0.05,
  /** 矢印の 三角の 高さの 下限（px） */
  arrowMinHeightPx: 32,
  /** 矢印が 出る・消える ふわっと（ステップ。12 = 0.2 秒） */
  arrowFadeSteps: 12,
  /** 矢印が さす 相手の 体の 中心の 高さ（足もとから マス） */
  arrowBodyCenterTiles: 0.9,
} as const;

/**
 * 1P・2P の 色（#rrggbb。案 B。2026-11-06 オーナー決定。値は src/ui/theme/tokens.css と 同じ: palette.test.ts が 見張る）。
 * 1P = --rk-xp、2P = --rk-rarity-3。矢印は 相手の 色（1P の 画面の 矢印 = p2、2P の 画面の 矢印 = p1）。
 */
export const DUO_COLORS = {
  p1: '#9bf26b',
  p2: '#c79bff',
} as const;
