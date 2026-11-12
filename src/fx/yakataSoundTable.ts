/**
 * MINE-1F §3.4 の 場面の 表（時間・dB）。コードでの 数の 出どころは ここ 1 か所〔窓口 `yakataSoundTable()` は これを かえす〕。
 * 文書は 仕様 §3.4 の 表 1 か所（ここに 写した 数は それと 同じ）。はかった 数〔長さ・ピーク〕は `docs/audio/MINE-1F.md`。
 * 何も import しない 葉。
 */
export interface YakataSoundTable {
  /** やかたに 入る とき 今の BGM → ふんいきの 入れかえ（秒） */
  swapSec: number;
  /** ずずん・出現音の あと 挑戦の 曲を 頼む まで（秒。出現音の 心臓・太鼓と 曲の 太鼓を ぶつけない） */
  challengeDelaySec: number;
  /** 挑戦の 曲が 入る ときの フェード（秒） */
  challengeFadeSec: number;
  /** 挑戦の 曲が 鳴る 間 ふんいきを 下げる 量（dB。マイナス） */
  ambienceUnderDb: number;
  /** かち・まけ・とじた とき 曲・ふんいきを 消す フェード（秒） */
  endFadeSec: number;
  /** かち: ファンファーレの あと 宝箱の 音 4 段目 まで（秒） */
  chestAfterFanfareSec: number;
  /** かち: 宝箱の 音の あと 実績の 音 まで（秒。大きな 音が 同じ ときに ならない ように） */
  achievementAfterChestSec: number;
  /** やかたを 出た・かった あと もとの BGM へ もどす フェード（秒） */
  backSec: number;
}

const TABLE: YakataSoundTable = {
  swapSec: 1.5, // 1.5 秒の 入れかえ（クロスフェード）
  challengeDelaySec: 3.4, // 出現音の 3.4 秒 あとから
  challengeFadeSec: 1.5, // 1.5 秒で 入る
  ambienceUnderDb: -6, // 曲の 下で −6 dB
  endFadeSec: 0.8, // 0.8 秒で 消す
  chestAfterFanfareSec: 1.3, // ファンファーレの 約 1.3 秒 あと
  achievementAfterChestSec: 1, // 宝箱の 音の 1 秒 あと
  backSec: 1.5, // 1.5 秒で もどす
};

/** 窓口 `yakataSoundTable()`（mine の 窓口は これを そのまま かえす） */
export const yakataSoundTable = (): YakataSoundTable => ({ ...TABLE });
