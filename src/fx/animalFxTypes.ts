import type { SwingReason } from '../contracts';

/** 窓口 `animals.fx()` の 数（`fxReset()` で 0） */
export interface AnimalFxCounts {
  hearts: number;
  burst: number;
  confetti: number;
  puff: number;
  sparkle: number;
  /** 版 3.2: あみ を ふった ときの はっぱ の つぶ */
  leaf: number;
  /** LIVE-2: から の かけら（かえる たび 6） */
  shell: number;
  /** LIVE-2.1: たいら に した ときの 土けむり の つぶ（`flattenDust`。1 列 1 つ・25 まで） */
  dust: number;
}

export interface Seen {
  x: number;
  y: number;
  z: number;
  gen: number;
  /** パタパタ の 音を 最後に 鳴らした ステップ */
  flutterAt: number;
}

/** 頭の 上の しるし 1 組（1 わ ぶん。ハート／あしあと・おなかいっぱい）。使いまわす */
export interface MarkRow {
  id: number;
  x: number;
  y: number;
  z: number;
  /** 0 = ハート なし */
  hearts: number;
  /** 0 = あしあと なし */
  steps: number;
  follow: number;
  fullLeft: number;
  /** LIVE-2: いえ の しるし の うまり（0 = なし） */
  home: number;
  /** 頭 の 上 の しるし の 高さ（ひよこ は ひくい） */
  headY: number;
  /** LIVE-2.1: 小屋 の 子 に なって から の ステップ（-1 = 出さない） */
  pop: number;
  /** LIVE-3: メニュー ページ 2 で えらんで いる 子（▼ は 描く 側 が 3D で 出す。ここ は 数 だけ） */
  pick: boolean;
  /** LIVE-4: 「！」（絵 は HTML〈`ui/machoMarks`〉。ここ は 窓口 `fx().marks` の 行 だけ） */
  bang: boolean;
  /** LIVE-4: ねらい の しるし の 行（`id` = ねらわれて いる 妖怪 の id） */
  machoTarget: boolean;
}

/** ねて いる 子 の Z 1 つ ぶん */
export interface ZzzRow {
  id: number;
  x: number;
  y: number;
  z: number;
}

/** とんで くる むし 1 ぴき（§2.4。ふって 10 ステップ 目 から 20 ステップ） */
export interface BugFlight {
  x: number;
  y: number;
  z: number;
  /** とぶ 向き（Three.js の `rotation.y`。頭 = −z が すすむ 向きを 向く） */
  yaw: number;
  /** 上下 の かたむき（ラジアン。上へ とぶ と 正） */
  pitch: number;
  /** 大きさ の 倍率（ぴょんと 出て くる） */
  scale: number;
  /** 空中 で まるまる（体を たてに ちぢめる 割合 0..0.25） */
  curl: number;
  age: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface Pending {
  at: number;
  x: number;
  y: number;
  z: number;
  caught: boolean;
  reason: SwingReason;
  /** なにを 流すか（なければ あみ） */
  act?: 'shell' | 'hatchSnd';
}
