/**
 * せっていの「がめん」タブの 中身（GFX-1。docs/tickets/GFX-1.md §3）。
 * おもさ 4 つ（とても かるい・かるい・ふつう・きれい）と、「くわしく」（かげ・がめんの こまかさ・ちかくの こまかさ）。
 * 実際に 変える 所は GfxPort（src/start/gfxController.ts。wire/gfx.ts が 作る）。ここは 画面だけ。
 */
import { MICRO_CHOICES, RES_CHOICES, WEIGHTS, type Res, type Weight } from '../../start/gfxPref';
import type { GfxPort } from '../../start/gfxController';
import './graphicsPanel.css';

/** おもさの ボタンの 名前（✦ の 数 = ならび 順の 1〜4） */
const WEIGHT_LABEL: Record<Weight, string> = { xlight: 'とても かるい', light: 'かるい', normal: 'ふつう', fine: 'きれい' };
/** ちかくの こまかさの ボタンの 文字 */
const microLabel = (r: number): string => (r === 0 ? 'なし' : String(r));
/** testid に 使う 名前（1.5 は 1_5） */
const resId = (r: Res): string => String(r).replace('.', '_');

export interface GraphicsPanel {
  readonly el: HTMLElement;
  /** 今の ようすに 合わせて 描きなおす（せっていを 開いた とき・押した とき） */
  refresh(): void;
}

export function createGraphicsPanel(port: () => GfxPort | null): GraphicsPanel {
  const el = document.createElement('div');
  const weights = WEIGHTS.map(
    (w, i) =>
      `<button type="button" class="set-text-btn gfx-btn" data-testid="gfx-weight-${w}" data-help="ui:gfxWeight_${w}" data-menu-item aria-pressed="false"><span class="gfx-marks" aria-hidden="true">${'✦'.repeat(i + 1)}</span>${WEIGHT_LABEL[w]}</button>`,
  ).join('');
  const shadows = [['on', 'オン'], ['off', 'オフ']]
    .map(([k, t]) => `<button type="button" class="set-text-btn gfx-btn" data-testid="gfx-shadow-${k}" data-help="ui:gfxShadow" data-menu-item aria-pressed="false">${t}</button>`)
    .join('');
  const ress = RES_CHOICES.map((r) => `<button type="button" class="set-text-btn gfx-btn" data-testid="gfx-res-${resId(r)}" data-help="ui:gfxRes" data-menu-item aria-pressed="false">${r}</button>`).join('');
  const micros = MICRO_CHOICES.map((r) => `<button type="button" class="set-text-btn gfx-btn" data-testid="gfx-micro-${r}" data-help="ui:gfxMicro" data-menu-item aria-pressed="false">${microLabel(r)}</button>`).join('');
  el.innerHTML =
    `<h3 class="set-h">おもさ</h3>` +
    `<p class="set-lead">ゲームの おもさを えらぶよ。うごきが おもい ときは かるく してね。</p>` +
    `<div class="gfx-row" data-testid="gfx-weights">${weights}</div>` +
    `<button type="button" class="set-text-btn" data-testid="gfx-more" data-help="ui:gfxMore" data-menu-item aria-expanded="false">くわしく</button>` +
    `<div class="gfx-detail" data-testid="gfx-detail" hidden>` +
    `<p class="set-lead">おうちの ひと むけ</p>` +
    `<div class="gfx-row" data-testid="gfx-shadow-row"><span class="gfx-lab">かげ</span>${shadows}</div>` +
    `<div class="gfx-row"><span class="gfx-lab">がめんの こまかさ</span>${ress}</div>` +
    `<div class="gfx-row"><span class="gfx-lab">ちかくの こまかさ</span>${micros}</div>` +
    `</div>` +
    `<p class="gfx-note" data-testid="gfx-ring-note" role="status" hidden>とおくの ひろさは つぎに あそぶ ときから かわるよ</p>`;
  const q = (id: string): HTMLButtonElement => el.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
  const detail = el.querySelector<HTMLElement>('[data-testid="gfx-detail"]')!;
  const more = q('gfx-more');
  const shadowRow = el.querySelector<HTMLElement>('[data-testid="gfx-shadow-row"]')!;
  const note = el.querySelector<HTMLElement>('[data-testid="gfx-ring-note"]')!;

  const refresh = (): void => {
    const s = port()?.state();
    if (!s) return;
    for (const w of WEIGHTS) q(`gfx-weight-${w}`).setAttribute('aria-pressed', String(s.weight === w));
    q('gfx-shadow-on').setAttribute('aria-pressed', String(s.shadow));
    q('gfx-shadow-off').setAttribute('aria-pressed', String(!s.shadow));
    // ?shadow=0 の ときは かげの 行を 出さない（作らない と きまっている）
    shadowRow.hidden = !s.shadowAllowed;
    for (const r of RES_CHOICES) q(`gfx-res-${resId(r)}`).setAttribute('aria-pressed', String(s.res === r));
    for (const r of MICRO_CHOICES) q(`gfx-micro-${r}`).setAttribute('aria-pressed', String(s.microR === r));
    note.hidden = !s.ringNote;
  };
  const act = (id: string, fn: (p: GfxPort) => void): void => {
    q(id).addEventListener('click', () => {
      const p = port();
      if (p) fn(p);
      refresh();
    });
  };
  for (const w of WEIGHTS) act(`gfx-weight-${w}`, (p) => p.setWeight(w));
  act('gfx-shadow-on', (p) => p.setShadow(true));
  act('gfx-shadow-off', (p) => p.setShadow(false));
  for (const r of RES_CHOICES) act(`gfx-res-${resId(r)}`, (p) => p.setRes(r));
  for (const r of MICRO_CHOICES) act(`gfx-micro-${r}`, (p) => p.setMicro(r));
  more.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    more.setAttribute('aria-expanded', String(!detail.hidden));
  });
  return { el, refresh };
}
