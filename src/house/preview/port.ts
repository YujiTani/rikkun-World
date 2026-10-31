// HOUSE-1B 見本（3D）と エディターの 窓口・UI の つなぎ目。three なし（Preview3D が この 形で 答える。wireHouse が つなぐ）。
import type { Step } from '../editor/tuning';
import type { GlowInfo } from './glow';
import type { PreviewMode } from './mesh';

/** すすみごとの 見本の 見せ方（③ なまえ は 見本が ない ＝ null）。「すすみ → 見せ方」は この 表 1 か所 */
const PREVIEW_OF = { soto: 'outside', naka: 'inside', namae: null } as const satisfies Record<Step, PreviewMode | null>;

/** その すすみで 見せる 見本の 見せ方（見本が なければ null） */
export function previewModeOf(step: Step): PreviewMode | null {
  return PREVIEW_OF[step];
}

/** 見本の 今の ようす（窓口 `editor().preview` の 元）。yaw ＝ 見る 向き（度。0 ＝ まえから、90 ＝ みぎから）、elev ＝ 見おろす 角度 */
export interface PreviewInfo {
  yaw: number;
  elev: number;
  touched: boolean;
  /** さわった あと また 回り出す までの のこりの コマ（null ＝ 回って いる） */
  wait: number | null;
  /** 形を 作りなおした 回数（形が かわった とき と 光りの はじまり・おわり） */
  builds: number;
  glow: GlowInfo | null;
}

/** 見本への 入口（窓口 previewDrag・previewWheel・hover が 使う）。見本が 出て いなければ 何も しない */
export interface PreviewPort {
  /** その 見せ方の ようす。見本を まだ 作って いなければ null */
  info(mode: PreviewMode): PreviewInfo | null;
  /** 見本を ドラッグ／wheel した のと 同じ。まわせたら true */
  drag(dx: number, dy: number): boolean;
  wheel(dx: number, dy: number): boolean;
  /** まどの ボタンに 手を おいた（true）／はなした（false） */
  hover(on: boolean): void;
}

/** 見本を つなぐ 前（テスト）は 何も しない */
export const NO_PREVIEW: PreviewPort = {
  info: () => null,
  drag: () => false,
  wheel: () => false,
  hover: () => undefined,
};
