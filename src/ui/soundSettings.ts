/**
 * 案内画面の「おと」ボタンと、音量のつまみ（SOUND.md §7）。案内画面の `playOverlay.el` の中に入れる。
 * 文字はひらがな・カタカナだけ。保存は soundSettingsModel.ts。
 */
import type { AudioSettings } from '../fx/audioConfig';
import type { FxSettings } from '../fx/config';
import './soundSettings.css';

export interface SoundSettingsDeps {
  audio: AudioSettings;
  fx: Pick<FxSettings, 'fxVolume'>;
  /** 変えたあと（mixer.apply・保存など）。つまみは動かしているあいだ何度も呼ぶ */
  onChange: () => void;
}

export interface SoundSettingsUi {
  readonly el: HTMLDivElement;
  /** 設定（settings.set も含む）を画面に合わせる */
  refresh(): void;
  /** つまみの枠を閉じる */
  close(): void;
  isOpen(): boolean;
}

const KNOBS = [
  { id: 'sound-master', label: 'ぜんぶ', get: (d: SoundSettingsDeps) => d.audio.masterVolume, set: (d: SoundSettingsDeps, v: number) => (d.audio.masterVolume = v) },
  { id: 'sound-bgm', label: 'おんがく', get: (d: SoundSettingsDeps) => d.audio.bgmVolume, set: (d: SoundSettingsDeps, v: number) => (d.audio.bgmVolume = v) },
  { id: 'sound-fx', label: 'こうかおん', get: (d: SoundSettingsDeps) => d.fx.fxVolume, set: (d: SoundSettingsDeps, v: number) => (d.fx.fxVolume = v) },
] as const;

export function createSoundSettings(deps: SoundSettingsDeps, parent?: HTMLElement): SoundSettingsUi {
  const el = document.createElement('div');
  el.className = 'ss-root';
  el.innerHTML =
    `<div class="ss-panel" data-testid="sound-panel" hidden>` +
    KNOBS.map(
      (k) =>
        `<label class="ss-row"><span class="ss-label">${k.label}</span>` +
        `<input class="ss-range" type="range" min="0" max="1" step="0.01" data-testid="${k.id}" aria-label="${k.label}"></label>`,
    ).join('') +
    `</div>` +
    `<div class="ss-buttons">` +
    `<button type="button" class="ss-open" data-testid="sound-open" aria-expanded="false">おとの おおきさ</button>` +
    `<button type="button" class="ss-mute" data-testid="sound-mute" aria-pressed="false"><span class="ss-icon" aria-hidden="true"></span><span class="ss-text">おと</span></button>` +
    `</div>`;
  const panel = el.querySelector<HTMLElement>('.ss-panel')!;
  const openBtn = el.querySelector<HTMLButtonElement>('.ss-open')!;
  const muteBtn = el.querySelector<HTMLButtonElement>('.ss-mute')!;
  const icon = el.querySelector<HTMLElement>('.ss-icon')!;
  const ranges = [...el.querySelectorAll<HTMLInputElement>('.ss-range')];

  const refresh = (): void => {
    const m = deps.audio.audioMuted;
    muteBtn.setAttribute('aria-pressed', String(m));
    muteBtn.classList.toggle('ss-muted', m);
    icon.textContent = m ? '🔇' : '🔊';
    KNOBS.forEach((k, i) => {
      const r = ranges[i];
      // つまみを動かしている最中に 値を戻さない（同じ値のときは触らない）
      const v = k.get(deps);
      if (Math.abs(Number(r.value) - v) > 1e-9) r.value = String(v);
    });
  };
  const setOpen = (on: boolean): void => {
    panel.hidden = !on;
    openBtn.setAttribute('aria-expanded', String(on));
  };

  // 案内画面のクリック（あそびを始める）に 伝えない
  for (const ev of ['click', 'pointerdown', 'mousedown']) el.addEventListener(ev, (e) => e.stopPropagation());
  openBtn.addEventListener('click', () => setOpen(panel.hidden));
  muteBtn.addEventListener('click', () => {
    deps.audio.audioMuted = !deps.audio.audioMuted;
    refresh();
    deps.onChange();
  });
  ranges.forEach((r, i) => {
    r.addEventListener('input', () => {
      const v = Math.min(1, Math.max(0, Number(r.value)));
      if (Number.isFinite(v)) KNOBS[i].set(deps, v);
      deps.onChange();
    });
  });

  refresh();
  setOpen(false);
  if (parent) {
    parent.appendChild(el);
    // 案内画面を閉じる（あそぶにもどる）と、枠も閉じる
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => {
        if (parent.hidden) setOpen(false);
      }).observe(parent, { attributes: true, attributeFilter: ['hidden'] });
    }
  }
  return { el, refresh, close: () => setOpen(false), isOpen: () => !panel.hidden };
}
