/**
 * #293 試作: 大きい がしゃどくろ（第一形態）の 大きさ・置く場所・登る 道の 数。ここを 変えるだけで 調整できる。
 * 開発中は URL の `?proto=gashaBig&tune={"place":{"distance":50}}` か、コンソールの `__gashaBig.tune({ place: { distance: 50 } })` で 上書きして
 * `__gashaBig.place()` を もういちど 呼ぶと 効く（作りなおす 数は place のとき 読む）。
 * 単位: ブロック = 1 ブロック（1 = 1 m）、度 = Deg。
 * 「もとの 座標」は 見本（design-v1）と おなじ 数え方（からだの 中心 = こしの 真上が 原点、+x = キャラの 左、+y = 上、+z = 前）。
 * ぜんたいは `size.height` に あわせて 一まとめに 拡大・縮小される（その ぶん 当たりも ついて いく）。
 */
export const TUNE = {
  /** 大きさ */
  size: {
    height: 60, // 頭の いちばん 上（矢は 入れない）の 高さ（ブロック）
  },
  /** 置く 場所 */
  place: {
    distance: 40, // プレイヤーの 前方 この 距離に からだ（こしの 真上）を 置く（ブロック）。手は これより 手前に のびる
    faceYawOffsetDeg: 0, // プレイヤーの 方を 向く 向きからの ずらし（度）
    headYawDeg: 0, // 頭だけ からだに 対して 横に 向ける（度。0 = からだと おなじ 向き）
    groundPick: 'max' as 'max' | 'min' | 'center', // 地面の 高さを 手・からだの 下の 何点かから 決める 方法（max = いちばん 高い 所に 合わせる）
  },
  /** 見えない 当たりの 箱 */
  collide: {
    margin: 0.0, // 当たりの 箱を ぜんぶ この ぶんだけ 大きく（ブロック。+ = ひろがる、− = ちぢむ）
    topLift: 0.0, // 立つ 面を この ぶんだけ 持ち上げる（ブロック。目で 見える 面より ういて 見えるなら 下げる）
    cloudFill: 0.84, // 雲の 当たりは 見た目の ひろさの この 割合（ふちの 丸い 所で 落ちないように ちいさめ）
    cloudThick: 2.6, // 雲の 当たりの あつさ（ブロック）。うすすぎると 坂で すきまが できる
  },
  /** うで（もとの 座標。x は 左右 どちらも 外がわへ のびる 向き） */
  arm: {
    upper: [13, -15.5, 13.5] as [number, number, number], // かたから ひじまで（外へ・下へ・前へ）。坂が ゆるい ほど のぼりやすい（1 ブロック すすむ ごとに 1 以上 上がると のぼれない）
    fore: [2, -20.5, 22.4] as [number, number, number], // ひじから 手首まで（手首は 地面の すこし 下）
    foreExtend: 2.5, // 前わんの 当たりを 手首の 先へ のばす 長さ（手首の 段差を ならす）
    handThick: 1.1, // 手の ひらの あつさ（ブロック。1 くらいだと 地面から 1 だんで 乗れる）
    upperWidth: 5.0, // 上わんの 上を 歩ける 幅（もとの 座標）
    upperThick: 6.0, // 上わんの そでの あつさ（見た目 と 当たり）
    foreWidth: 4.4, // 前わんの はば（見た目 と 当たり）
    foreThick: 3.6, // 前わんの あつさ（見た目 と 当たり）
  },
  /** こしの 雲（地面から だんだんに つみあがる すりガラスの 渦雲） */
  waist: {
    tiers: 20, // だんの 数
    stepUp: 1.0, // 1 だん ごとの 高さ（ブロック。1 以内なら ジャンプで 登れる）
    baseLen: 50, // いちばん 下の 雲の 長さ（もとの 座標）
    baseDep: 36, // いちばん 下の 雲の はば
    shrink: 0.9, // 1 だん 上がるごとに ちぢめる 長さ
    z: -8, // 雲の 中心の 前後
  },
  /** 肩・頭へ のぼる 雲の 道（もとの 座標。a = 下の はし、b = 上の はし。どちらも 雲の 上の 面の まんなか。左右 とも 作る） */
  route: {
    shoulder: { a: [12, 38.6, -4.5], b: [40, 38.6, -4.5], width: 22, thick: 3 }, // 肩の 雲（平ら。前の はしは 上わんの つけ根に ぴったり）
    rampOut: { a: [39.5, 38.7, -7], b: [15.8, 53.0, -7], width: 6, thick: 3 }, // 肩の 雲の 外はしから、頭の 横の ヘアリボンへ のぼる 坂
    rampIn: { a: [12.3, 53.6, -9], b: [12.3, 64.5, 6], width: 6, thick: 3 }, // ヘアリボンから 頭の 横を 前へ のぼって 頭の 上へ
  },
  /** 雲の 見た目（すりガラス） */
  glass: {
    color: 0xeaf6ff, // 雲の 色
    alphaTop: 0.46, // 上の 面の 濃さ（0〜1）
    alphaSide: 0.7, // ふち・横の 面の 濃さ（ふちが 少し 明るい）
    alphaBottom: 0.36, // 下の 面の 濃さ
    swirlColor: 0xffffff, // うずまきの 線の 色
  },
};

type Json = { [k: string]: unknown };
const merge = (dst: Json, src: Json): void => {
  for (const [k, v] of Object.entries(src)) {
    const cur = dst[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object') merge(cur as Json, v as Json);
    else if (Array.isArray(v) && Array.isArray(cur) && v.length === cur.length) dst[k] = v;
    else if (typeof v === typeof cur) dst[k] = v; // 型が おなじ ものだけ 上書き
  }
};

/** 数を 上書きする（開発中だけ） */
export function applyTune(o: unknown): void {
  if (o && typeof o === 'object') merge(TUNE as unknown as Json, o as Json);
}

/** URL の `tune=<JSON>` を 読む */
export function applyTuneFromUrl(search: string): void {
  try {
    const raw = new URLSearchParams(search).get('tune');
    if (raw) applyTune(JSON.parse(raw));
  } catch { /* こわれた JSON は むし */ }
}
