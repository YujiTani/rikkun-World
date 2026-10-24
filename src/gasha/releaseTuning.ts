import type { ItemId } from '../contracts';

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
  /** 霧の 外の 見え方（決定「霧の 外でも 影が 見える」）: 遠い ほど 空に 溶けず、暗い 単色の シルエットに 近づく。描画回数は ふえない（体の 材料の シェーダーに 数行 足す だけ） */
  silhouette: {
    on: true, // false で 試作の まま（空の 色に 霞む）
    color: 0x1e2433, // 色: シルエットの 色（0xRRGGBB。暗い 青みの 灰色）
    nearBlocks: 60, // ブロック: カメラから この 距離で シルエットに 近づき はじめる
    farBlocks: 150, // ブロック: この 距離で いちばん 濃く なる
    strength: 0.88, // 割合: いちばん 濃い とき の 色の まざり 具合（0 = そのまま、1 = 完全に 単色）
    hazeMax: 0, // 割合: 試作の 霞み（空の 色に 溶ける）の 最大。シルエットと けんかしない よう 0（gashaBigTuning の look.hazeMax を 上書き）
  },
  /** 少女の 形態への きりかえ（くわしい 戦いの 数は gashaGirlTuning.ts。5 回の 魔法 → 大きな 姿に もどって eye.bigWaitSec 休む → また 少女、を たおすまで くりかえす） */
  girl: {
    hpFraction: 1 / 3, // 割合: 大きな 姿の 体力が これ 以下に なると 少女の 形態へ（オーナー決定: 体力 1/3 以下）
    loadHpFraction: 0.6, // 割合: 少女の 3D（約 4 MB）を 先に 読みこみはじめる 体力。きりかえで 待たされない ように 早めに。読んでおくだけで 出さない
  },
  /** 開発用「すぐ出す」（`__rikkun.gasha.spawn()`） */
  dev: {
    distance: 60, // ブロック: 引数なしで すぐ 出すとき の プレイヤーからの 距離
  },
  /** たおされた あと */
  defeat: {
    lingerSec: 4, // 秒: たおれてから 体が 消えるまで（その間に 宝箱が 出る）
  },
  /** 大きな 宝箱 */
  chest: {
    width: 3.2, // ブロック: よこ はば
    depth: 2.2, // ブロック: おくゆき
    bodyHeight: 1.5, // ブロック: 箱の 高さ（ふたを のぞく）
    lidHeight: 0.8, // ブロック: ふたの 高さ
    openRadius: 5, // ブロック: プレイヤーが これより 近づくと 自分で あく（よこの 距離）
    openHeight: 4, // ブロック: 上下の 差が これ以内 なら 近いと する
    openSec: 1.2, // 秒: ふたが ひらききる まで
    openAngleDeg: 112, // 度: ふたの ひらく 角度
    dropDelaySec: 0.5, // 秒: ふたが ひらき はじめてから 中身が とびだす まで
    riseSec: 1.0, // 秒: 地面から せり上がって 出てくる 時間
    dropUpOffset: 1.6, // ブロック: 中身が とびだす 高さ（箱の 底から）
    scatterSpeed: [1.5, 2.8] as [number, number], // ブロック/秒: 中身が 散らばる 横の 速さ（最小, 最大）
    scatterUp: [5.5, 7] as [number, number], // ブロック/秒: 中身が とびあがる 速さ（最小, 最大）
    glowSec: 1.2, // 秒: あく ときの 金色の 光が 消える まで
    stayOpenSec: 120, // 秒: あけた 宝箱が そのまま のこっている 時間（そのあと 消える）
  },
  /** ごほうび（仮。忍者の ほかの 部位が できたら ここを 入れかえる） */
  reward: {
    guaranteed: [{ item: 'ninja_tabi', count: 1 }] as { item: ItemId; count: number }[], // かならず 入る もの（個）
    rare: [
      { item: 'crystal', min: 3, max: 5 }, // すいしょう（個の はんい。最小〜最大の 一様）
      { item: 'iron_ingot', min: 6, max: 10 }, // てつの かたまり（個）
      { item: 'yokai_orb', min: 4, max: 6 }, // ようかいだま（個）
    ] as { item: ItemId; min: number; max: number }[],
    seedSalt: 2931, // 数: 中身の 数を きめる 乱数の 種に まぜる 数
  },
};

export type ReleaseTune = typeof RELEASE;
