/**
 * 案内画面（左下の「おと」のとなり）の「かげ」の オン／オフ（SHADOW.md §8 の画面の配置、AC16）。
 * 文字はひらがな・カタカナだけ。影のしくみを作っていないとき（?shadow=0）は出さない。
 * 保存は shadowPref.ts（main.ts が呼ぶ）。
 */
import './shadowSetting.css';

export interface ShadowSettingUi {
  readonly el: HTMLDivElement;
  /** 影のしくみがあるか・いまの オン／オフ・変えたときの呼び先 */
  bind(available: boolean, on: boolean, onChange: (on: boolean) => void): void;
  /** 画面のボタンの押された見た目を合わせる */
  refresh(on: boolean): void;
}

export function createShadowSetting(parent: HTMLElement): ShadowSettingUi {
  const el = document.createElement('div');
  el.className = 'shs-row';
  el.dataset.testid = 'shadow-setting';
  el.hidden = true;
  el.innerHTML =
    `<span class="shs-label">かげ</span>` +
    `<button type="button" class="shs-btn" data-testid="shadow-on" aria-pressed="true">オン</button>` +
    `<button type="button" class="shs-btn" data-testid="shadow-off" aria-pressed="false">オフ</button>`;
  // 案内画面のクリック（あそびを始める）に 伝えない
  for (const ev of ['click', 'pointerdown', 'mousedown']) el.addEventListener(ev, (e) => e.stopPropagation());
  parent.appendChild(el);
  const onBtn = el.querySelector<HTMLButtonElement>('[data-testid="shadow-on"]')!;
  const offBtn = el.querySelector<HTMLButtonElement>('[data-testid="shadow-off"]')!;
  const refresh = (on: boolean): void => {
    onBtn.setAttribute('aria-pressed', String(on));
    offBtn.setAttribute('aria-pressed', String(!on));
  };
  return {
    el,
    bind(available, on, onChange) {
      el.hidden = !available;
      refresh(on);
      onBtn.addEventListener('click', () => onChange(true));
      offBtn.addEventListener('click', () => onChange(false));
    },
    refresh,
  };
}
