import type { ScreenSettings } from '../contracts';

/** 画面の状態・自動セーブの数値（`settings.*` から読み書きできる。M2 §2.5・§4.4） */
export function createScreenSettings(): ScreenSettings {
  return {
    /** もちもの画面が開いているあいだの時間の速さ（ふだんの 1/4） */
    inventoryTimeScale: 0.25,
    /** 自動セーブの間隔（ステップ。600 = 10 秒） */
    saveIntervalTicks: 600,
  };
}
