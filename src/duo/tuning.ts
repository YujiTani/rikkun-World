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
  /** 「＋で さんか」を 出している 長さ（世界が 動いている ステップ。180 = 3 秒。§2.1・作業 3d） */
  joinHintSteps: 180,
  /** 2 人のとき ホットバーを 半分の 幅の 何割に おさめるか（倍。§3.1） */
  hotbarFit: 0.9,
  /** 距離メーターの 棒が いちばん 長いときの 画面の 幅に 対する 割合（§9.4） */
  meterWidthRatio: 0.3,
  /** 2P の 頭の 上の ▼ の 高さ（足もとから マス） */
  markHeightTiles: 2.35,

  // ---- 作業 2（#399）。値は 仕様 §2.4・§5・§7.2・§9.2・§9.3 ----
  /** 分割に なる 距離（マス。24 以上で 分割） */
  splitUpAt: 24,
  /** 分割から 戻れる 距離（マス。17 以下が splitBackSteps つづいたら） */
  splitDownAt: 17,
  /** 分割から 戻るのに 必要な「17 以下」の つづき（ステップ。60 = 1 秒） */
  splitBackSteps: 60,
  /** ようすを 切りかえたあと 次の 切りかえを しない 間（ステップ。60 = 1 秒。色の 段には 効かない） */
  viewWaitSteps: 60,
  /** 2P の 足もとが 画面の 内側 この 割合の 外に 出ると ルーペ(NDC の 絶対値。0.9 = 90%) */
  loupeOutRatio: 0.9,
  /** 2P の 足もとが 画面の 内側 この 割合の 中に 入ると ルーペが 消える(0.8 = 80%) */
  loupeInRatio: 0.8,
  /** ルーペが 出る・消える までの つづき（ステップ。18 = 0.3 秒） */
  loupeHoldSteps: 18,
  /** ルーペの 直径(画面の 高さに 対する 割合) */
  loupeDiameterRatio: 0.2,
  /** ルーペの 画面の ふちからの すきま（px） */
  loupeEdgePx: 16,
  /** ルーペを 置かない 上の 帯(画面の 高さに 対する 割合。メーター) */
  loupeTopRatio: 0.12,
  /** ルーペを 置いて よい 下の 限り(画面の 高さに 対する 割合。これより 下 22% は ホットバー) */
  loupeBottomRatio: 0.78,
  /** ルーペの わくの 太さ(px)。[ふつう, 1 段目, 2 段目] */
  loupeBorderPx: [4, 6, 8] as const,
  /** 見せ方の 長さ（ステップ）: ルーペが 出る/消える・分割へ/から・動きを 減らす設定 */
  transitionSteps: { loupe: 12, split: 24, reduced: 9 } as const,
  /** 輪を 2 つに する 距離（マス。これより 遠い）と、1 つに 戻す 距離（これより 近い） */
  ringsUpAt: 48,
  ringsDownAt: 32,
  /** 持つ 列の 上限（1 人の 441 の 1.35 倍） */
  layoutMaxColumns: 595,
  /** 軽くする 工夫(分割の あいだ): 小ブロックを 細かく 描く 半径（マス） */
  lightMicroRadiusTiles: 16,
  /** 軽くする 工夫を 元に 戻すまで（ステップ。120 = 2 秒） */
  lightRestoreSteps: 120,
  /** ルーペの 絵を 描く 範囲（2P から マス。§7.2-3。カメラの 距離ぶんは 足す） */
  loupeDrawTiles: 16,
  /** 2P の カメラ(分割)の 距離（マス。§9.1） */
  cameraSplit: 5.0,
  /** 分割の 線の 太さ（px。1280 幅のとき。§9.1） */
  splitLinePx: 4,
  /** ルーペの 外の 三角の 中心が ルーペの ふちから はなれる 距離（px） */
  loupeArrowGapPx: 7,
  /** 輪が 小さくなった とき、1 仕事で 捨てる 列の 数（1 コマで ぜんぶは 捨てない） */
  layoutDropPerJob: 4,
  /** 2P の 頭の 上の「？」の 高さ（足もとから マス） */
  questionHeightTiles: 2.9,

  // ---- 作業 3a（#416）。値は 仕様 §9.5 ----
  /** 2P が 倒れてから 1P の 横に 戻るまで（ステップ。180 = 3 秒） */
  p2ReturnSteps: 180,
} as const;

/**
 * 1P・2P と 段の 色（#rrggbb。案 B。2026-11-06 オーナー決定。値は src/ui/theme/tokens.css と 同じ: palette.test.ts が 見張る）。
 * 1P = --rk-xp、2P = --rk-rarity-3、段 = --rk-text → --rk-accent → --rk-accent-2（赤は ダメージと まざるので 使わない）。
 */
export const DUO_COLORS = {
  p1: '#9bf26b',
  p2: '#c79bff',
  /** 色の 段ごとの 色（0 = ふつう・1 = 1 段目・2 = 2 段目） */
  tier: ['#ffffff', '#ffc83d', '#ff8a1f'] as const,
} as const;
