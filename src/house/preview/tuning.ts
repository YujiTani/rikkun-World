// HOUSE-1B 見本（3D）の 数を 1 か所に（ルール #304）。仕様 docs/design/HOUSE-1.md §4.9（見本）。three なし。
// 家の 見た目（色・絵）は look.ts、家具の 大きさ・材料は editor/furniture.ts、画面の 数は ui/houseEditor/tuning.ts。
// PR-2 で ドラッグ・wheel・窓と 戸の 光りの 数（dragYawPerPx など）を ここに 足す。

/** 見本（§4.9。アートが 試作で 決めた 数） */
export const PREVIEW = {
  /** 回る 速さ: 1 周 20 秒 ＝ 描く コマ（60/秒）で 1,200 コマ（1 コマ 0.3°） */
  lapFrames: 1200,
  /** 見下ろす 角度（度）。そと ＝ 低め（戸と 窓が 見える）、なか ＝ ななめ 50° */
  outsideElevDeg: 26,
  insideElevDeg: 50,
  /** カメラの 視野角（度）。小さめ ＝ ゆがみが 少ない */
  fovDeg: 30,
  /** 地面の 板が 家の 外まわりより 広い マス（そと ＝ 広め、なか ＝ へりだけ） */
  groundMargin: { outside: 2, inside: 0 },
  /** はじめの 向き（度。戸の 壁から 見て ななめ 前）。動きを へらす 設定では この 向きで 止める */
  stillYawDeg: 28,
  /** 画面に 入れる 余白（1 ＝ ぴったり） */
  fitMargin: 1.06,
  /** なかの 見本で、カメラに 近い かべが さがりはじめる・きえる 向き（かべの 外向きと カメラの 向きの 内積） */
  wallDropFrom: 0.1,
  wallDropTo: 0.45,
} as const;

/** 家具の 絵（ボタン・方眼の 家具・置く 前の ゴースト）の 数 */
export const FURN_ART = {
  /** 上から 見た 絵: 1 マスあたり px（方眼の マスは 48〜70 px なので 縮めて 使う） */
  topPxPerCell: 64,
  /** ボタン用の ななめ絵の 大きさ（px の 正方形） */
  isoPx: 128,
  /** ゴースト（置く 前の 家具）: 置ける ＝ 白、置けない ＝ 赤。色は RGB、まぜる 量は 0〜1。ふちの 太さは px */
  ghostOk: [255, 255, 255],
  ghostOkMix: 0.78,
  ghostNg: [255, 77, 85],
  ghostNgMix: 0.7,
  ghostRimPx: 3,
} as const;

/** しょうじ・戸の 板（案 C しあげ）。ブロックの 外がわの 面から 内がわへの きょり（1 ＝ ブロック 1 つ ぶん） */
export const OPENING = {
  /** 戸: 外がわの 面に そろえた あつさ 4/16 の 板 1 まい */
  doorThick: 0.25,
  /** しょうじ: あつみの まん中（外がわの 面から 0.5）に ある うすい 紙の 板 */
  shojiAt: 0.5,
  shojiThick: 1 / 16,
} as const;
