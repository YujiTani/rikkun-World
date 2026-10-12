import type { AttackPhase, HitBox } from '../yokai';
import type { PreviewController, PreviewMotion } from './controller';

export interface PreviewYokaiInfo {
  id: string;
  name: string;
  number: number;
  width: number;
  height: number;
  depth: number;
  minY: number;
  /** いま画面に出ている色（#rrggbb、重複なし） */
  colors: string[];
  mainColor: string;
  motion: PreviewMotion;
  silhouette: boolean;
  scale: number;
  blinking: boolean;
  /** 台の上の x */
  x: number;
  face: 'open' | 'closed' | 'scary';
  attackPhase: AttackPhase | null;
  hitCount: number;
  lastHitBox: HitBox | null;
  /** 当たり判定の赤い線が出ているか */
  hitVisible: boolean;
  /** 妖怪ごとの、いまの姿の数字（ぬりかべの leanDeg、ろくろくびの headDist など） */
  info: Record<string, number>;
  fireballs: { x: number; y: number; z: number; traveled: number }[];
}

export interface PreviewLabels {
  /** 名前ラベルが見えているか */
  names: boolean;
  /** 番号ラベル（1〜4）が見えているか */
  numbers: boolean;
}

export interface PreviewHook {
  ready: boolean;
  yokai: () => PreviewYokaiInfo[];
  karakasaX: () => number;
  stairX: () => number;
  attackView: () => boolean;
  doll: () => { width: number; height: number; silhouette: boolean; visible: boolean };
  silhouette: () => boolean;
  rotating: () => boolean;
  view: () => string;
  /** 台の向き（度、0〜360） */
  yawDeg: () => number;
  labels: () => PreviewLabels;
  /** 画面に出ている文字 */
  texts: () => string[];
  pause: () => void;
  resume: () => void;
  /** 一時停止中に n コマ（1/60 秒）進める */
  step: (n?: number) => void;
  steps: () => number;
  press: (action: string) => void;
}

declare global {
  interface Window {
    __preview?: PreviewHook;
  }
}

export type { PreviewController };
