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
    distance: 50, // プレイヤーの 前方 この 距離に からだ（こしの 真上）を 置く（ブロック）。手は これより 手前に のびる
    faceYawOffsetDeg: 0, // プレイヤーの 方を 向く 向きからの ずらし（度）
    headYawDeg: 0, // 頭だけ からだに 対して 横に 向ける（度。0 = からだと おなじ 向き）
    groundPick: 'hands' as 'hands' | 'max' | 'min' | 'center', // 立つ 高さの 決め方（hands = 両手の 下の 地面の 平均、max = いちばん 高い 所、min = いちばん 低い 所、center = こしの 下）
    levelGround: true, // 両手の まわりの 地面を 手の 高さに ならす（ワールドの ブロックを おきかえる 試作用）。地面が でこぼこでも 手から 1 だんで 登れる
    padHalfWidth: 6, // ならす 幅（手の 中心から 左右 この 長さ。もとの 座標）
    padBack: 10, // 手首より うしろ（からだ がわ）へ この 長さ ならす
    padFront: 5, // 指の さきより 前へ この 長さ ならす
    padDepth: 8, // 手の 高さより 下へ うめる 深さ（ブロック）
    padHeight: 8, // 手の 高さより 上を あける 高さ（ブロック）
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
    upper: [2, -15.5, 18] as [number, number, number], // かたから ひじまで（外へ・下へ・前へ）。坂が ゆるい ほど のぼりやすい（1 ブロック すすむ ごとに 1 以上 上がると のぼれない）
    fore: [2, -20.5, 22.4] as [number, number, number], // ひじから 手首まで（手首は 地面の すこし 下）
    elbowExtend: 0.0, // 上わんの 当たりを ひじの 先へ のばす 長さ（ひじの つなぎ目の 段差を ならす）
    foreExtend: 2.5, // 前わんの 当たりを 手首の 先へ のばす 長さ（手首の 段差を ならす）
    handThick: 1.1, // 手の ひらの あつさ（ブロック。1 くらいだと 地面から 1 だんで 乗れる）
    upperWidth: 5.0, // 上わんの 上を 歩ける 幅（もとの 座標）
    upperThick: 3.8, // 上わんの そでの あつさ（見た目 と 当たり）
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
    shoulder: { a: [12, 37.6, -4.5], b: [56, 37.6, -4.5], width: 22, thick: 3 }, // 肩の 雲（平ら。前の はしは 上わんの つけ根に ぴったり）
    rampOut: { a: [46, 37.7, -10], b: [13.5, 54.0, -10], width: 6, thick: 3 }, // 肩の 雲の 外はしから、頭の 横の ヘアリボンへ のぼる 坂
    rampIn: { a: [11.6, 53.6, -9], b: [11.6, 65.6, 6], width: 7, thick: 3 }, // ヘアリボンから 頭の 横を 前へ のぼって 頭の 上へ
  },
  /**
   * 動き（Meshy の 人型の モーションを 箱の 関節へ うつす。しくみは gashaBigMotion.ts の 先頭）。
   * 強さ = 関節ごとの 動きの 大きさ（0 = 動かない、1 = そのまま、1.5 = 大きめ）。左右 どちらの 関節も 書く。
   */
  clips: {
    fadeSec: 0.25, // クリップの つなぎ目の クロスフェード（秒）
    idleFadeSec: 0.6, // 止まって 休みの 姿勢に もどる 秒
    /** はう（Climb 左 → 右 の くり返し。かべ登りを 地面を はう 動きに 回す） */
    climb: {
      pitchDeg: 90, // 「たて → 前」の 回し（度。x 軸まわり。かべ登り = 90）。手が 地面に つかないなら ここを ふやす / へらす
      ref: 'mean', // 箱の 休みの 姿勢に する コマ: 'mean' = 平均、'first' = 最初、'12' のように コマ番号
      mirror: false, // 左右 入れかえ
      strength: {
        Hips: 0, Spine: 0.6, Spine01: 0.6, Spine02: 0.6, neck: 0.5, Head: 0.5,
        LeftShoulder: 1, LeftArm: 1, LeftForeArm: 1, LeftHand: 0.6,
        RightShoulder: 1, RightArm: 1, RightForeArm: 1, RightHand: 0.6,
      } as Record<string, number>,
    },
    /** 止まって ふり返る（首と 頭が 主。うでは 使わない） */
    lookBack: {
      pitchDeg: 0,
      ref: 'mean',
      mirror: false,
      strength: {
        Hips: 0, Spine: 0, Spine01: 0, Spine02: 0.25, neck: 1, Head: 1, // 胸を ひねると うでも 動いて 手が 地面から はなれる ので 小さく
        LeftShoulder: 0, LeftArm: 0, LeftForeArm: 0, LeftHand: 0,
        RightShoulder: 0, RightArm: 0, RightForeArm: 0, RightHand: 0,
      } as Record<string, number>,
    },
  },
  /** はって 進む（左右の 手を 交ごに ついて、体ごと 前へ） */
  crawl: {
    speed: 1.5, // 進む 速さ（ブロック / 秒）。ついている 手は 地面を すべらない ように 腕が 合わせる
    motionRate: 0.5, // 動きの 速さ（1 = もとの クリップの 速さ 1.2 秒。小さいほど ゆっくり 手を 出す）。速さと 合わせて 1 歩の 長さが きまる
    plantSpread: 0.5, // ついた 手の 横の 位置: 0 = 休みの 位置、1 = クリップの ついた 位置（クリップは かべ登りで 手が 横に ふれる ので 半分に）
    turnDegPerSec: 12, // 体ごと 向きを かえる 速さ（度 / 秒）
    moveAngleDeg: 35, // 目的地との 向きの ずれが これ より 大きい 間は 進まず、その場で 向きを かえる（度）
    contactTol: 4, // 手首が いちばん 低い 所から この 高さ 以内なら「地面に ついている」（もとの 座標。2 倍で 外れる）
  },
  /** ふり返る（Crawl and Look Back） */
  lookBack: {
    rate: 0.6, // 動きの 速さ（1 = もとの 速さ 6.9 秒）
  },
  /** さまよう（ふだん。シード付き 乱数で 目的地を 決める） */
  wander: {
    enabledAtStart: true, // 置いた ときから さまよう（false なら 止まって いる。`__gashaBig.walk(true)` で はじめる）
    radius: 70, // 置いた 場所から この 距離（ブロック）の 中で 目的地を 決める
    minDist: 25, // 目的地までの 距離の 下限（ブロック）
    arriveDist: 3, // 目的地に 着いた と みなす 距離（ブロック）
    pauseSec: [3, 8] as [number, number], // 着いた あと 止まる 秒（最小・最大）
    lookBackChance: 0.4, // 止まった とき ふり返る 確率（0〜1）
  },
  /** 地面の 高さに ついて いく */
  ground: {
    followSpeed: 3, // 1 秒に 上がる・下がる 高さの 上限（ブロック / 秒）
  },
  /** 目の 色（白 ↔ 赤） */
  eyes: {
    fadeSec: 0.3, // 白 ↔ 赤の 切りかえに かかる 秒
    calmColor: 0xffffff, // ふだんの 目（白）
    angryColor: 0xff3b2a, // 怒った 目（赤）
  },
  /** 怒り（攻撃されたら） */
  angry: {
    calmSec: 20, // 攻撃されなく なってから 白目に もどるまで（秒）
    turnDegPerSec: 25, // 怒って いる 間、プレイヤーの 方へ 向く 速さ（度 / 秒）
  },
  /** のっている プレイヤー */
  ride: {
    turnWithBody: true, // 体が 向きを かえた ぶん プレイヤーの 向きも いっしょに まわす
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
