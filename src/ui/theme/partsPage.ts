/** 部品見本のページ（テスト用。/src/ui/theme/parts.html）。スクショと DOM しらべ（e2e/helpers/uiRules.ts）に使う */
import { ruby } from '../text';
import {
  createBadge,
  createBar,
  createButton,
  createCard,
  createChip,
  createMedal,
  createMeter,
  createModal,
  createPanel,
  createSlot,
  createTab,
  createTooltip,
  setBar,
} from './parts';

/** 色つきの 16×16 の 絵（見本用。dataURL） */
function swatch(color: string): string {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = color;
    g.fillRect(2, 2, 12, 12);
    g.fillStyle = '#ffffff';
    g.fillRect(4, 4, 4, 4);
  }
  return c.toDataURL();
}

function row(...els: HTMLElement[]): HTMLDivElement {
  const r = document.createElement('div');
  r.style.display = 'flex';
  r.style.flexWrap = 'wrap';
  r.style.alignItems = 'center';
  r.style.gap = 'var(--rk-sp-4)';
  r.append(...els);
  return r;
}

const root = document.getElementById('parts-root');
if (root) {
  root.style.padding = 'var(--rk-sp-5)';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = 'var(--rk-sp-4)';

  const panel = createPanel({ title: { html: `ぶひん ${ruby('見本', 'みほん')}` }, onClose: () => undefined });
  panel.root.id = 'parts-panel';
  panel.root.style.maxWidth = 'calc(1200 / 12.8 * 1vw)';

  const tabs = row(
    createTab({ text: 'もちもの', selected: true }),
    createTab({ text: 'じっせき', dot: true }),
    createTab({ text: 'こわす', guide: true }),
  );

  const slots = row(
    createSlot({ art: swatch('#7a5a2a'), count: 12 }).root,
    createSlot({ art: swatch('#2a7a5a'), count: 1, rarity: 1 }).root,
    createSlot({ art: swatch('#2a5a9a'), count: 64, rarity: 2, selected: true }).root,
    createSlot({ art: swatch('#7a2a9a'), rarity: 3 }).root,
    createSlot({ art: swatch('#9a7a2a'), rarity: 4 }).root,
    createSlot({ art: swatch('#9a4a2a'), rarity: 5 }).root,
    createSlot({ art: swatch('#9a9a5a'), rarity: 6 }).root,
    createSlot().root,
    createSlot({ size: 'hotbar', art: swatch('#9a7a2a'), count: 3, selected: true }).root,
    createSlot({ size: 'tansu', art: swatch('#555555'), count: 9 }).root,
  );

  const primary = createButton({ text: 'つくる', kind: 'primary' });
  primary.classList.add('rk-pulse');
  const buttons = row(
    primary,
    createButton({ text: 'とじる', kind: 'normal' }),
    createButton({ text: 'ざいりょう が たりない', disabled: true }),
  );

  const xp = createBar('xp', 0.48);
  xp.root.style.width = 'calc(240 / 12.8 * 1vw)';
  const bake = createBar('bake');
  bake.root.style.width = 'calc(240 / 12.8 * 1vw)';
  setBar(bake, 0.7);
  const bars = row(xp.root, bake.root, createMeter(6, 4).root, createBadge(3), createBadge(12, 'accent'));

  const cards = row(
    (() => {
      const c = createCard();
      const t = document.createElement('div');
      t.className = 'rk-fs-title';
      t.textContent = 'いし の つるはし';
      const s = document.createElement('div');
      s.className = 'rk-fs-small';
      s.textContent = 'すこし めずらしい';
      const n = document.createElement('div');
      n.className = 'rk-num';
      n.style.color = 'var(--rk-ng)';
      n.textContent = '1 / 3';
      c.append(t, s, n);
      return c;
    })(),
    (() => {
      const t = createTooltip(2);
      t.name.textContent = 'てつ の つるはし';
      t.desc.textContent = 'かたい ブロック を ほれる';
      return t.root;
    })(),
  );

  const chips = row(
    createChip({ text: 'かみ ×2', art: swatch('#dddddd') }),
    createChip({ text: 'や が いるよ', tone: 'ng', art: swatch('#aa3333') }),
    createChip({ text: 'もちもの が いっぱい！', tone: 'ng', head: true }),
    createChip({ text: 'おうち に もどった', tone: 'info' }),
  );
  chips.style.background = '#ffffff';
  chips.style.padding = 'var(--rk-sp-4)';

  const medals = row(
    createMedal('bronze', 48, swatch('#7a5a2a')),
    createMedal('silver', 48, swatch('#2a7a5a')),
    createMedal('gold', 48, swatch('#2a5a9a')),
    createMedal('rainbow', 48, swatch('#9a2a5a')),
    createMedal('locked', 48),
  );

  panel.body.style.display = 'flex';
  panel.body.style.flexDirection = 'column';
  panel.body.style.gap = 'var(--rk-sp-4)';
  panel.body.append(tabs, slots, buttons, bars, cards, chips, medals);

  // モーダル（見本は 右下に ちいさく置く。本物は 画面ぜんたい）
  const m = createModal();
  m.scrim.id = 'parts-modal';
  m.scrim.style.position = 'static';
  m.scrim.style.display = 'inline-flex';
  m.scrim.style.background = 'var(--rk-scrim)';
  m.scrim.style.padding = 'var(--rk-sp-5)';
  m.scrim.style.maxWidth = 'calc(700 / 12.8 * 1vw)';
  const h = document.createElement('div');
  h.className = 'rk-fs-display';
  h.style.color = 'var(--rk-accent)';
  h.textContent = 'おめでとう！';
  m.modal.append(h, createMedal('gold', 96, swatch('#2a5a9a')), createButton({ text: 'とじる', kind: 'primary', disabled: true }));

  root.append(panel.root, m.scrim);
}
