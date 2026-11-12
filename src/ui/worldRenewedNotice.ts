import { withRuby } from './text';
import './worldRenewedNotice.css';

/** 古い セーブを 新しい 地形で 開いた とき 1 回 だけ 出す おしらせ（画面の 文字は ひらがな・カタカナ。漢字は ［漢字｜よみ］） */
export const WORLD_RENEWED_TEXT = 'せかいが あたらしく なったよ。もちものは そのままだよ';
/** 出して おく 長さ（秒。固定ステップの 時間） */
export const WORLD_RENEWED_SECONDS = 10;

/** おしらせの 要素を 作って 返す。毎ステップ update(dt) で 時間を 数え、すぎたら 消す */
export function showWorldRenewedNotice(parent: HTMLElement): { el: HTMLDivElement; update(dt: number): void } {
  const el = document.createElement('div');
  el.id = 'world-renewed-notice';
  el.setAttribute('role', 'status');
  el.innerHTML = withRuby(WORLD_RENEWED_TEXT);
  parent.append(el);
  let left = WORLD_RENEWED_SECONDS;
  return {
    el,
    update(dt: number): void {
      if (left <= 0) return;
      left -= dt;
      if (left <= 0) el.remove();
    },
  };
}
