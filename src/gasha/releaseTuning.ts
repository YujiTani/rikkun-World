import type { ItemId, Rarity } from '../contracts';

/**
 * #293 リリース: がしゃどくろを ふだんの ゲームに 出す 数の 表（調整表）。値を かえる だけで 出方・ごほうびを 直せる。
 * 単位: ブロック = 1 ブロック（1 = 1 m）、秒 = 実時間の 秒（ゲームは 1/60 秒 ごとに 進む）、割合 = 0〜1、回 = 回数、個 = 個数。
 * 大きな 姿・少女の 戦いの 数は gashaBigTuning.ts・gashaGirlTuning.ts。ここは「いつ・どこに 出て、いつ 消えて、何を おとすか」だけ。
 * 開発中は コンソールで `Object.assign(__rikkun.gasha.tune.spawn, { chancePerMorning: 1 })` のように その場で 上書きできる（`__rikkun.gasha.tune`）。
 */
export const RELEASE = {
  /** 出方 */
  spawn: {
    chancePerMorning: 0.3, // 割合: ゲームの 1 日の はじまり（あさ）ごとに 出る 確率（0.3 = 約 3 割）
    minDistance: 150, // ブロック: 出る 場所は プレイヤーから これ 以上 はなれた 所
    maxDistance: 250, // ブロック: 出る 場所は プレイヤーから これ 以内
    despawnDistance: 400, // ブロック: たおさなくても プレイヤーが これより 遠くへ はなれたら 消える（出る 距離より 十分 遠く）
    checkEverySec: 1, // 秒: 遠さを しらべる 間かく
    landTries: 16, // 回: 海・水の 上を さけて 向きを ひきなおす 回数（それでも だめなら その 日は 出ない）
    landProbeRadius: 24, // ブロック: 置く 場所の まわり この 半径の 4 点も 海でない ことを たしかめる（手が 水の 上に ならない ように）
    barShowDistance: 100, // ブロック: 体力ゲージを 出す 距離（これより 遠い 間・いない 間は かくす。霧と 描く 範囲の すこし 外）
    saltSeed: 293, // 数: 日ごとの 乱数に まぜる 数（世界の シード・何日目と いっしょに 使う。かえると 出る 日が かわる）
  },
  /** 霧の 外の 見え方（決定「霧の 外でも 影が 見える」。yuzu 2026-11-10 FIX-3: 山の 上で 黒く 浮いて 見えた ので、遠い ほど 空（fog）の 色に とける ほうを 主に した。うっすら シルエットは のこす）。描画回数は ふえない（体の 材料の シェーダーに 数行 足す だけ） */
  silhouette: {
    on: true, // false で 試作の まま（空の 色に 霞む）
    color: 0x1e2433, // 色: シルエットの 色（0xRRGGBB。暗い 青みの 灰色）
    nearBlocks: 60, // ブロック: カメラから この 距離で シルエットに 近づき はじめる
    farBlocks: 150, // ブロック: この 距離で いちばん 濃く なる
    strength: 0.3, // 割合: いちばん 濃い とき の シルエット色の まざり 具合（0 = そのまま、1 = 完全に 単色）。うすく して 空に とけ させる（FIX-3。0.88 だった）
    fogMix: 0.75, // 割合: シルエットの 色のうち 空（fog）の 色の 割合（0 = 暗い 色 そのまま、1 = 空の 色）。空に 近づけて 黒く 浮かせない（FIX-3）
    hazeMax: 0.75, // 割合: 霞み（遠い ほど 空の 色に 溶ける）の 最大。遠くの ぼやけの 主役（FIX-3。0 だった。gashaBigTuning の look.hazeMax を 上書き）
  },
  /** 少女の 形態への きりかえ（くわしい 戦いの 数は gashaGirlTuning.ts。体力 1/2 で 固まる → 笑い → ワープ → ポーズ → 5 回の 魔法 → かたに 座って eye.bigWaitSec 休む → また 魔法、を とどめまで くりかえす） */
  girl: {
    hpFraction: 1 / 2, // 割合: 大きな 姿の 体力が これ 以下に なると 少女の 形態へ（オーナー決定 2026-10-24 20:25: 体力 半分 以下。はじめは 1/3 だった）
    loadHpFraction: 0.6, // 割合: 少女の 3D（約 4 MB）を 先に 読みこみはじめる 体力。きりかえで 待たされない ように 早めに。読んでおくだけで 出さない
  },
  /** 開発用「すぐ出す」（`__rikkun.gasha.spawn()`） */
  dev: {
    distance: 60, // ブロック: 引数なしで すぐ 出すとき の プレイヤーからの 距離
  },
  /** たおされた あと */
  defeat: {
    safetyExtraSec: 5, // 秒: コアを こわしてから くずれ おわる 時間（gashaBigTuning の finish.crumble.sec）に 足す 余裕。これを すぎたら 合図が なくても 体を 片づける
  },
  /** コアの ドロップ(オーナー 2026-10-24 15:18・15:19: 宝箱は やめて、コアを たたく たびに PSO ふうに ばらまく。何が 出るかは 下の reward の 表を つかう) */
  core: {
    hitScale: 0.4, // 倍: コアを 1 回 たたく ごとに ばらまく レア素材の 量(reward.rare の 最小〜最大 に かけて 四捨五入。最低 1)
    dropUp: 0.5, // ブロック: ばらまく 高さの 足し(コアの 上の 面から。FIX-3: コアは 体の 外の 地面に 置かれる ので 地面より 下に ならない)
    scatterSpeed: [3, 6] as [number, number], // ブロック/秒: 散らばる 横の 速さ(最小, 最大。いきおいよく)
    scatterUp: [6, 9] as [number, number], // ブロック/秒: とびあがる 速さ(最小, 最大)
    glow: 'legendary' as Rarity, // 柱・光の 輪の 見た目の めずらしさ（7 段目 = 虹色。FIX-3）。アイテム自体の めずらしさは かえない
    /** コアを こわした 大きな 一山（FIX-3: 虹の 柱で 1 か所から いきおいよく 飛び散る。場所は コア（体の 外）の 上） */
    pile: {
      upBlocks: 1.5, // ブロック: コアの 上の 面から ばらまく 高さの 足し
      scatterSpeed: [4, 9] as [number, number], // ブロック/秒: 散らばる 横の 速さ(最小, 最大)
      scatterUp: [8, 12] as [number, number], // ブロック/秒: とびあがる 速さ(最小, 最大)
    },
  },
  /**
   * コアの ドロップの 中身は ここ 1 か所(仮)。ほかの かならず 入る 物が ほしく なったら、guaranteed に { item, count } の 行を 足すだけで
   * コアを こわした 一山に 入る(コードは かえない)。たたく たびの 小さな ばらまきは rare の 一部(core.hitScale)
   */
  reward: {
    guaranteed: [] as { item: ItemId; count: number }[], // かならず 入る もの（個。コアを こわした 一山だけ。忍者装備は ここでは なく 「まだ 手に 入れて いない 物から 1 つ」の くじ（NINJA-1。src/craft/ninjaTuning.ts・ninjaDrop.ts）で 毎回 1 つ 入る）
    rare: [
      { item: 'crystal', min: 3, max: 5 }, // すいしょう（個の はんい。最小〜最大の 一様）
      { item: 'iron_ingot', min: 6, max: 10 }, // てつの かたまり（個）
      { item: 'yokai_orb', min: 4, max: 6 }, // ようかいだま（個）
    ] as { item: ItemId; min: number; max: number }[],
    seedSalt: 2931, // 数: 中身の 数を きめる 乱数の 種に まぜる 数
  },
};

export type ReleaseTune = typeof RELEASE;
