/**
 * #293 試作: 少女（がしゃどくろ 第二形態）の 戦いの 数。ここを 変えるだけで バランスを 直せる。
 * 開発中は URL の `?proto=gashaGirl&tune={"s3":{"speed":18}}` か、コンソールの `__gashaGirl.tune({ s3: { speed: 18 } })` で 上書きできる。
 * 単位: 秒 = sec、ブロック = 距離・半径、度 = Deg、個 = count。
 */
export const TUNE = {
  /** 詠唱の 動き */
  cast: {
    speed: 1.28, // 詠唱クリップの 再生の はやさ（1 = もとの 約 2.3 秒、1.28 = 約 1.8 秒）
    fireAt: 0.7, // 魔法を 出す 場所（クリップの 何割か）
  },
  /** ワープの 流れ */
  timing: {
    standSec: 2.0, // 立って いる 時間
    vanishSec: 0.08, // 消える（ひゅっ）
    goneSec: 2.0, // 消えて 何も いない 時間
    appearSec: 0.4, // 現れる 演出
  },
  /** ワープ先 */
  warp: {
    s1: { distMin: 4, distMax: 5, leftChance: 0.5 }, // 魔法 1: 背面か 左横（距離 ブロック、左に なる 確率）
    s2: { distMin: 1.5, distMax: 2 }, // 魔法 2: 真後ろ すぐ近く（距離 ブロック）
    far: { distMin: 10, distMax: 12, fanDeg: 60 }, // 魔法 3・4: 距離を とる（前方 ± 度）
  },
  /** 目が 合った とき */
  eye: {
    angleDeg: 12, // 頭が カメラの 向きから この 角度 以内
    windowSec: 0.5, // 現れてから この 秒数 以内の 目だけ 数える
    maxCancels: 2, // 止められる 回数
    turnsPerShow: 5, // 1 回の 出番の 回数（止めた 回も 数える）
    holdSec: 1.5, // はずかしくて 止まる 時間
    bangSwapSec: 0.4, // 「！」から 頬染め「////」に かわる 秒
    bigTextSec: 1.0, // 「大きな姿にもどる」を 出す 秒
    bigWaitSec: 120, // 大きな姿に もどって 休む 秒（yuzu 2026-10-23: 2 分くらい。試すときは ?tune={"eye":{"bigWaitSec":5}} で 短く）
  },
  /**
   * 少女の 登場(オーナー 2026-10-24 15:08・15:11): 大きな 姿が 固まる → BGM が ぶつっと 切れて 笑い声 → 少女が プレイヤーの まわりを 高速で ワープして 飛びまわり
   * → 正面で 止まって 決めポーズ → BGM「災厄」が 流れて 戦い。ワープの 音・見た目は ふだんの ワープと おなじ(はやく した もの)。
   */
  intro: {
    laughSec: 3.2, // 秒: 笑い声を 聞かせる 間(少女は まだ 見えない。笑い声の 長さ 約 2 秒 ＋ ひと呼吸)
    warps: 5, // 回: プレイヤーの まわりを 飛びまわる ワープの 回数(そのあと 正面に 止まる)
    warpSec: 0.28, // 秒: 1 回の ワープ(現れて 次へ 飛ぶ まで。高速)
    radius: 6, // ブロック: 飛びまわる 半径(プレイヤーから)
    poseDist: 4.5, // ブロック: 決めポーズで 止まる プレイヤーの 正面からの 距離
    poseSec: 2.5, // 秒: 決めポーズで 止まる 時間(a・b・c の とき。float は 下の float.inSec + float.holdSec。おわると BGM「災厄」が 流れて 戦いが はじまる)
    poseBlendSec: 0.25, // 秒: ポーズに 入る までの 時間(a・b・c の とき)
    /**
     * どの 決めポーズか。float = 空中で 足を 組んで 座る(オーナー 2026-10-24 17:31。gashaGirlFloat.ts)。
     * もとの 仮の ポーズにも もどせる(gashaGirlPoseData.ts の a: おほほ / b: X がまえ / c: そでを ひるがえす)
     */
    poseName: 'float',
    /** 決めポーズ float: 立ち姿 → しずんで(ため)→ くるっと 上がって 座る → 座った まま ゆっくり 上下に ゆれる */
    float: {
      inSec: 0.55, // 秒: 立ち姿から 座りおわる までの 入りの 時間(しずむ ぶんも ふくむ)
      dipSec: 0.12, // 秒: 上がる まえに ひざを まげて しずむ ため(入りの はじめ)
      dipDeg: 40, // 度: しずむ ときに ひざを まげる 角度(足の うらは 地面に ついた まま 腰が さがる)
      holdSec: 2.6, // 秒: 座って ためる 時間(入りの あと。おわると BGM「災厄」で 戦い)
      hoverGap: 1.0, // ブロック: 浮く 高さ(いちばん 下の つま先と 地面の すき間)
      spinDeg: 360, // 度: 上がる ときの くるっと(0 で まわらない)
      yawDeg: 55, // 度: 座った 体を ななめに 向ける(0 = 正面。+ で 体の 右がわ・組んだ 足が 見える)
      headTurnDeg: 30, // 度: 顔だけ プレイヤーの 方へ もどす(見下ろす)
      bobUp: 0.07, // ブロック: 上下の ゆれの 大きさ(片側)
      bobSec: 2.4, // 秒: 上下の ゆれの 周期(息・浮遊)
      breathDeg: 2.5, // 度: 息で 胸が ふくらむ 角度
      swingDeg: 5, // 度: のばした 足が ゆれる 角度
    },
  },
  /** 大きな 姿の かたに 座って 休む(5 回の 魔法の あと。休む 秒は eye.bigWaitSec) */
  perch: {
    blendSec: 0.4, // 秒: 座りポーズに 入る までの 時間
    swaySec: 3.0, // 秒: 足を ぶらぶら させる 周期
    swayDeg: 8, // 度: 足を ぶらぶら させる ふれ幅
    hitHalf: [0.8, 1.0, 0.8] as [number, number, number], // ブロック: 座っている 少女の 当たりの 箱の はんぶんの 大きさ(よこ・たか・おくゆき)
    hipUp: 0.35, // ブロック: 座った とき お尻(腰の 骨)を かたの 上から どれだけ 上に するか
    hitUp: 0.9, // ブロック: 当たりの 箱の 中心の 高さ(座った お尻から)
  },
  /** とどめ(体力 0 の 一撃)のあと: その場に 座りこんで 動かない → コアが こわれたら 消える */
  finish: {
    sitBlendSec: 0.5, // 秒: 座りこむ ポーズに 入る までの 時間
    fadeSec: 3, // 秒: コアが こわれてから 少女が 透けて 消える までの 時間(大きな 姿の くずれの はじめから)
    crumbleSparksPerSec: 90, // 個/秒: 消えて いく 間に 体から 出る 粉の 数
    crumbleFall: 1.6, // ブロック/秒: 粉の 落ちる 速さ(下向き)
    crumbleColors: [0xf0d8ff, 0x6020c0] as [number, number], // 粉の 色(はじめ, おわり)
  },
  /** パリィ（少女の 魔法） */
  parry: {
    reflectSpeedMul: 1.2, // はね返した 弾の 速さの 倍率（もとの 速さに かける）
    girlHitR: 0.9, // はね返した 弾が 少女に 当たる 半径（ブロック）
    flinchSec: 0.5, // ひるむ 時間（秒。この間 少女の 動きが 止まる）
    flinchTiltRad: 0.22, // のけぞる 角度（ラジアン）
    reflectWaitMaxSec: 4, // はね返した 弾が 飛んでいる 間、次の ワープを 待つ 最長の 時間（秒）
    setCooldownSec: 0.5, // 輪・渦の 当たりを 見る 間隔（秒。むてき時間と おなじ ぐらい）
  },
  /** BGM「災厄」（少女が 出ている 間 ループ。大きな 姿の 曲との 切りかえも この 秒） */
  bgm: {
    fadeSec: 1.0, // 出はじめの フェードイン・止める ときの フェードアウト・曲の クロスフェード（秒）
    volume: 1.0, // 音量（0〜1。ミキサーの BGM 音量に さらに かかる）
  },
  /**
   * 効果音（オーナーが OK した 13 音 17 ファイル。public/sound/gasha/）。戦いの 数と いっしょに ここで 直せる。
   * 単位: 倍 = 音量の 倍率（1 = ファイルの まま）、cents = 音の 高さの ずれ（100 cents = 半音）、dB = 音量の ずれ、秒 = sec、回 = count。
   */
  sfx: {
    volume: 1.0, // 全体の 音量（倍。0 で 無音）
    detuneCents: 30, // 再生ごとの 高さの ゆらぎ（±cents）
    gainDb: 1, // 再生ごとの 音量の ゆらぎ（±dB）
    maxSame: 3, // 同じ ファイルの 同時に 鳴る 上限（回）。 たりない ぶんは 鳴らさない
    s4PlaysMin: 4, // 魔法 4 の 1 波で 鳴らす 回数の 下限（回。弾は 16 発でも 間引く）
    s4PlaysMax: 6, // 魔法 4 の 1 波で 鳴らす 回数の 上限（回）
    s4SpreadSec: 0.24, // 魔法 4 の 音を ずらす 間隔（秒。音は 0.7 秒 なので、0.24 秒おきなら 同時に 3 つ以内）
    /** 音ごとの 音量（倍）。ファイルは そろえて あるので ふだんは 1 */
    gain: {
      warp_out: 1, // 消える
      warp_in: 1, // 現れる
      cast: 1, // 詠唱
      s1_warn: 1, // 魔法 1 の 予告
      s1_erupt: 1, // 魔法 1 の 噴出
      s2_vortex: 1, // 魔法 2 の 渦（9 か所でも 1 回）
      s3_spawn: 1, // 魔法 3 の 火の玉が うかぶ（3 種を 順番に）
      s3_fire: 1, // 魔法 3 の 発射（3 種を 順番に）
      s3_hit: 1, // 魔法 3 の 爆発
      s4_fire: 1, // 魔法 4 の 青い 弾
      eye_pipin: 1, // 目が 合った
      eye_blush: 1, // 「////」
      player_hit: 1, // 魔法が 当たった
      girl_laugh: 1, // 固まった あとの 笑い声(girl_laugh_a)
    },
  },
  /** ダメージ */
  damage: {
    heart: 2, // 1 発の ダメージ（体力 2 = ハート 1 つ）
  },
  /** 魔法 1: 噴き出す（輪 3 つ） */
  s1: {
    rings: 3, // 輪の 数（足もと・進む 先・その 左右どちらか）
    radius: 3.8, // 輪の 半径（ブロック）
    delaySec: 0.4, // 輪が 出てから 噴き出す まで（予告の 時間）
    ahead: 3, // 進む 方向の 輪の 距離（ブロック）
    side: 3, // 3 つめの 輪の よこの ずれ（ブロック）
    activeSec: 1.1, // 1 本の 炎が 出ている 時間（輪の 当たりは これが おわる まで）
  },
  /** 魔法 2: 周囲攻撃（渦 9 か所） */
  s2: {
    grid: 3, // 1 辺の 渦の 数（3 → 3×3 = 9 か所）
    spacing: 6, // 渦と 渦の 中心の 間隔（ブロック）
    radius: 2.4, // 1 つの 渦の 半径（ブロック。間隔 − 半径×2 が 安全な すき間）
    hitSec: 2.1, // 渦の 当たりが ある 時間（秒）
    totalSec: 2.6, // 渦が 消える まで（秒）
  },
  /** 魔法 3: 火の玉の 連射 */
  s3: {
    count: 20, // 火の玉の 数
    orbStartSec: 0.2, // うかべ はじめ（詠唱の はじめから 秒）
    orbGap: 0.05, // 1 個ずつ ぽっと 出る 間隔（秒）
    shotGap: 0.09, // 連射の 間隔（秒）
    speed: 22, // 飛ぶ 速さ（ブロック/秒）
    turnDeg: 160, // 曲がる 速さの 上限（度/秒）
    stopNear: 2, // プレイヤーに これより 近づいたら 追尾 おわり（ブロック）
    homingMaxSec: 2.5, // 追尾する 最長の 時間（秒）
    lifeSec: 4, // 消えるまで（秒）
    hitR: 0.6, // 当たる 距離（ブロック）
    pitchRad: 0.25, // 出だしの 上向き（ラジアン）
  },
  /** 魔法 4: 青い 波の 扇 */
  s4: {
    count: 16, // 1 波の 数
    fanDeg: 180, // 扇の ひろがり（度）
    speed: 6, // 飛ぶ 速さ（ブロック/秒）
    ampl: 0.6, // 蛇行の 振れ幅（ブロック）
    hz: 1.5, // 蛇行の 回数（回/秒）
    range: 14, // 射程（ブロック）
    lifeSec: 3, // 消えるまで（秒）
    turnDeg: 40, // 追尾で 曲がる 速さの 上限（度/秒）
    stopNear: 3, // これより 近づいたら 追尾 おわり（ブロック）
    secondWaveSec: 0.6, // 2 波目までの 間（秒）
    secondShift: 0.5, // 2 波目の ずらし（弾 1 本ぶんの 何割か）
    hitR: 0.6, // 当たる 距離（ブロック）
  },
};

type Json = { [k: string]: unknown };
const merge = (dst: Json, src: Json): void => {
  for (const [k, v] of Object.entries(src)) {
    const cur = dst[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object') merge(cur as Json, v as Json);
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
