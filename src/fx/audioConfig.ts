/**
 * 音の数を 1 か所に（docs/audio/SOUND.md §3・§4。preview.html の MIX と同じ数）。
 * settings.get/set には AudioSettings の名前で出す（つなぎ込みが createSettingsHook の extras に渡す）。
 */
export const MIX = {
  /** 全体の音量のはじめの値（0〜1）。はじめは小さめ */
  masterDefault: 0.6,
  /** BGM の大きさのはじめの値（効果音を 1 としたとき。約 -8 dB） */
  bgmDefault: 0.4,
  /** 効果音バスの中の倍率（効果音の大きさは fxVolume 側） */
  sfx: 1.0,
  /** BGM の入り・入れかえ・止めるときの秒 */
  fadeIn: 1.5,
  crossfade: 1.5,
  fadeOut: 0.8,
  /** 3 曲目が来たとき いちばん古い曲を消す秒 */
  quickFade: 0.1,
  /** 音量・ミュートを変えるとき かける秒（ぷつっと鳴らさない。0.05 以上） */
  rampSeconds: 0.06,
  /** 画面ごとの倍率の変わる秒 */
  screenSeconds: 0.3,
  /** タブを見ていないとき: 0 にする秒、もどすとき入る秒 */
  hiddenFade: 0.8,
  hiddenReturn: 1.5,
  /** 先読み（秒）。音の時計で予約する */
  lookahead: 0.2,
  /** 急に大きな音を出さないためのリミッター（全体の最後） */
  limiter: { threshold: -14, knee: 6, ratio: 4, attack: 0.005, release: 0.25 },
  /** 2 段目の天井: K まではそのまま、上は tanh で C までにおさえる（-1 dBFS を超えない） */
  ceiling: { knee: 0.5, max: 0.85 },
  /** 達成のときだけ BGM を下げる（祝う音そのものは大きくしない） */
  duck: { amount: 0.45, attack: 0.08, hold: 1.4, release: 1.0 },
} as const;

/** settings.get/set で読み書きする音の設定（fxVolume は FxSettings 側） */
export interface AudioSettings {
  /** 全体の音量 0〜1 */
  masterVolume: number;
  /** BGM の大きさ 0〜1（効果音を 1 としたとき） */
  bgmVolume: number;
  /** true で BGM も効果音も 0 */
  audioMuted: boolean;
  /** たたかいの判定: 妖怪がこの距離（ブロック）以内 */
  battleRange: number;
  /** たたかいに入るまでのステップ数（30 = 0.5 秒） */
  battleEnterTicks: number;
  /** たたかいから もどるまでのステップ数（240 = 4 秒） */
  battleExitTicks: number;
}

/** 設定の入れ物を作る（毎回 新しいコピー。つなぎ込みが createSettingsHook の extras に渡す） */
export function createAudioSettings(): AudioSettings {
  return {
    masterVolume: MIX.masterDefault,
    bgmVolume: MIX.bgmDefault,
    audioMuted: false,
    battleRange: 16,
    battleEnterTicks: 30,
    battleExitTicks: 240,
  };
}
