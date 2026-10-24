/**
 * #293 試作: がしゃどくろ（ボス）の 体力ゲージ。画面の 上に HTML で 重ねる（document が ある ときだけ）。
 * ふつうの 妖怪の 体力バー（docs/decisions/2026-10-23-hp-bar-chunks.md）と つながる 見た目:
 *   残りは 黄、へった ぶんは 灰、縁は 内側 紺 ＋ 外側 白の 二重。ボスらしく 大きく、ドット絵風（角を 段に 落とした 枠）。
 * 4 案（`?tune={"hit":{"barStyle":"A"}}` で きりかえ）:
 *   A = 黒地に 金の ふち ＋ どくろの 紋　B = お札（紙の 短冊）風 ＋ 赤い 判　C = 骨の 枠 ＋ ピンクの リボン
 *   D（既定）= 赤い バー ＋ 鋼色の 金属の 枠（水色の ふちどり）＋ 上の まん中に 金属の どくろと 翼の かざり ＋ 下の まん中に ひし形の 鋲
 * へる とき: 白い 残りが 少し おくれて ついてくる（ダメージの 見える化）。当たった とき 少し ゆれる。
 * 数は ぜんぶ gashaBigTuning.ts の hit.bar*。
 */
import { TUNE as T } from './gashaBigTuning';

export type BarStyle = 'A' | 'B' | 'C' | 'D';

/** どくろの 紋（9 × 9 ドット。X = 色の ドット） */
const SKULL = [
  '..XXXXX..',
  '.XXXXXXX.',
  'XXXXXXXXX',
  'XX..X..XX',
  'XX..X..XX',
  'XXXXXXXXX',
  '.XXXXXXX.',
  '..X.X.X..',
  '..X.X.X..',
];
/** ひし形の かざり（5 × 5） */
const DIAMOND = ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..'];
/** リボン（7 × 5） */
const RIBBON = ['XX...XX', 'XXX.XXX', 'XXXXXXX', 'XXX.XXX', 'XX...XX'];

/** D 案の かざり（31 × 10 ドット）。k = ふち、d = 暗い 鋼、s = 鋼、h = 明るい 鋼、b = 青い 目、c = 目の 光 */
export const ORNAMENT_D = [
  '...............k...............',
  '..............khk..............',
  '..............khk..............',
  '..........kkkkhhhkkkk..........',
  '.......k..khhhhhhhhhk..k.......',
  '......kdk.kskkkskkksk.kdk......',
  '....kddhhkksbcbsbcbskkhhddk....',
  '...kdhhhhsk' + 'sssdkdsss' + 'kshhhhdk...',
  '.kddhhdk..k' + '.khkhkhk.' + 'k' + '..kdhhddk.',
  '..kk......kkkkkkkkkkk......kk..',
];
const ORNAMENT_COLORS: Record<string, string> = { k: '#141a24', d: '#3a4452', s: '#7f8a9a', h: '#c9d4e2', b: '#2fb8f0', c: '#d6f6ff' };
/** 鋲（ひし形 7 × 5） */
const STUD_D = ['...k...', '..khk..', '.khshk.', '..kdk..', '...k...'];

const SHAKE_STYLE_ID = 'gashaBigHpBarStyle';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css = '', parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  parent?.appendChild(e);
  return e;
}

/** ドット絵（bitmap の X の ところに 1 ドット = dot px の 四角）を box-shadow で 作る */
function pixels(bitmap: readonly string[], color: string, dot: number): HTMLElement {
  const sh: string[] = [];
  bitmap.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'X') sh.push(`${x * dot}px ${y * dot}px 0 ${color}`); }));
  const d = el('div', `width:${dot}px;height:${dot}px;box-shadow:${sh.join(',')};flex:none`);
  const box = el('div', `width:${bitmap[0]!.length * dot}px;height:${bitmap.length * dot}px;flex:none`);
  box.appendChild(d);
  return box;
}

/** 角を 2 だん 落とした ドット絵風の 形 */
const notch = (p: number): string =>
  `polygon(0 ${2 * p}px,${p}px ${2 * p}px,${p}px ${p}px,${2 * p}px ${p}px,${2 * p}px 0,calc(100% - ${2 * p}px) 0,calc(100% - ${2 * p}px) ${p}px,calc(100% - ${p}px) ${p}px,calc(100% - ${p}px) ${2 * p}px,100% ${2 * p}px,100% calc(100% - ${2 * p}px),calc(100% - ${p}px) calc(100% - ${2 * p}px),calc(100% - ${p}px) calc(100% - ${p}px),calc(100% - ${2 * p}px) calc(100% - ${p}px),calc(100% - ${2 * p}px) 100%,${2 * p}px 100%,${2 * p}px calc(100% - ${p}px),${p}px calc(100% - ${p}px),${p}px calc(100% - ${2 * p}px),0 calc(100% - ${2 * p}px))`;

/** 入れ子の 枠を 作って いちばん 内側を 返す。layers = [色, 太さ（ドット）] を 外から 順に */
function frame(parent: HTMLElement, layers: readonly (readonly [string, number])[], p: number, css = '', fill = false): HTMLElement {
  let cur = parent;
  layers.forEach(([color, dots], i) => {
    cur = el('div', `background:${color};padding:${dots * p}px;clip-path:${notch(p)};box-sizing:border-box;${fill ? 'display:flex;flex:1;min-height:0;' : ''}${i === 0 ? css : ''}`, cur);
  });
  return cur;
}

export class HpBar {
  readonly root: HTMLElement;
  private fill!: HTMLElement;
  private ghost!: HTMLElement;
  private count!: HTMLElement;
  private shaker!: HTMLElement;
  private ratio = 1;

  constructor(private readonly style: BarStyle = (T.hit.barStyle as BarStyle)) {
    this.root = el('div');
    this.root.id = 'gashaBigHp';
    this.build();
    document.body.appendChild(this.root);
  }

  /** 1 ドット = dot px の ドット絵を canvas に 描く（c の 色の 表で） */
  private sprite(bitmap: readonly string[], dot: number, css = ''): HTMLCanvasElement {
    const w = bitmap[0]!.length, h = bitmap.length;
    const cv = el('canvas', `width:${w * dot}px;height:${h * dot}px;image-rendering:pixelated;flex:none;${css}`);
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    if (g) bitmap.forEach((row, y) => [...row].forEach((c, x) => { const col = ORNAMENT_COLORS[c]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }));
    return cv;
  }

  /** D 案: 赤い バー ＋ 鋼の 枠 ＋ 上の どくろの かざり ＋ 下の 鋲 */
  private buildD(): void {
    const H = T.hit;
    const p = Math.max(1, H.barDot);
    const q = p + 2; // かざりの 1 ドット
    const stroke = (c: string): string => `${p / 3}px 0 0 ${c},-${p / 3}px 0 0 ${c},0 ${p / 3}px 0 ${c},0 -${p / 3}px 0 ${c}`;
    this.root.style.cssText = `position:fixed;top:${H.barTopPx}px;left:50%;transform:translateX(-50%);width:min(${H.barWidthVw}vw,${H.barMaxPx}px);z-index:40;pointer-events:none;font-family:system-ui,sans-serif`;
    this.shaker = el('div', 'display:flex;flex-direction:column', this.root);
    // 上の 段: 名前（左）・かざり（まん中）・数（右）
    const head = el('div', `position:relative;display:flex;align-items:flex-end;justify-content:space-between;height:${8 * q}px;padding:0 ${2 * p}px ${2 * p}px`, this.shaker);
    const name = el('span', `font:700 ${H.barNameSizePx}px/1 system-ui,sans-serif;letter-spacing:.18em;color:#fff;text-shadow:${stroke('#141a24')},0 ${p}px 0 #141a24;white-space:nowrap`, head);
    name.textContent = 'がしゃどくろ';
    this.count = el('div', `font:700 ${Math.round(H.barNameSizePx * 0.65)}px/1 system-ui,sans-serif;color:#fff;text-shadow:${stroke('#141a24')},0 ${p}px 0 #141a24;letter-spacing:.05em`, head);
    // 枠つきの バー
    const bar = el('div', `position:relative;z-index:1;display:flex;flex-direction:column;clip-path:${notch(p)}`, this.shaker);
    const metal = (hair: boolean): string => `height:${3 * p}px;flex:none;background:linear-gradient(to bottom,${hair ? '#6fd3f2 0,#6fd3f2 ' + p + 'px,' : ''}#59667a ${hair ? p : 0}px,#59667a ${hair ? 2 * p : p}px,#2c3644 ${hair ? 2 * p : p}px,#2c3644 ${hair ? 3 * p : 2 * p}px,#161c26 ${hair ? 3 * p : 2 * p}px,#161c26 100%)`;
    el('div', metal(true), bar);
    const inner = el('div', `position:relative;height:${(H.barHeightDots + 2) * p}px;background:#2a070c;overflow:hidden`, bar);
    const bot = el('div', `height:${3 * p}px;flex:none;background:linear-gradient(to bottom,#161c26 0,#161c26 ${p}px,#2c3644 ${p}px,#2c3644 ${2 * p}px,#59667a ${2 * p}px,#59667a ${3 * p}px)`, bar);
    // 水色の ふちどり（下がわ）
    el('div', `position:absolute;left:${2 * p}px;right:${2 * p}px;bottom:0;height:${p}px;background:#6fd3f2;opacity:.8`, bot);
    this.ghost = el('div', 'position:absolute;left:0;top:0;bottom:0;width:100%;background:#fff;opacity:.92', inner);
    const u = Math.max(1, Math.round(((H.barHeightDots + 2) * p) / 8));
    this.fill = el('div', `position:absolute;left:0;top:0;bottom:0;width:100%;background:linear-gradient(to bottom,#ff8f7a 0,#ff8f7a ${u}px,#ff4030 ${u}px,#ee1c1c ${3 * u}px,#cc1016 ${3 * u}px,#a30a12 ${6 * u}px,#7d0710 ${6 * u}px,#7d0710 100%)`, inner);
    if (H.barSegments > 1) {
      const w = 100 / H.barSegments;
      el('div', `position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0,transparent calc(${w}% - ${p}px),rgba(60,0,8,.55) calc(${w}% - ${p}px),rgba(60,0,8,.55) ${w}%)`, inner);
    }
    // かざり（上の まん中。枠に かぶる）と 鋲（下の まん中）
    const orn = this.sprite(ORNAMENT_D, q, `position:absolute;left:50%;bottom:${-3 * q}px;transform:translateX(-50%);z-index:2`);
    head.appendChild(orn);
    el('div', `position:absolute;left:50%;bottom:${-2 * p}px;transform:translateX(-50%);display:flex`, bar).appendChild(this.sprite(STUD_D, p));
    this.set(1, 1, false);
    this.ghost.style.transition = 'none';
    this.injectStyle();
  }

  private build(): void {
    if (this.style === 'D') { this.buildD(); return; }
    const H = T.hit;
    const p = Math.max(1, H.barDot);
    const S = this.style;
    const out = H.barEdgeOut, inn = H.barEdgeIn;
    // 文字の まわりに 紺の ふちどり（ドット絵風に 4 方向）
    const outline = (c: string): string => `${p / 3}px 0 0 ${c},-${p / 3}px 0 0 ${c},0 ${p / 3}px 0 ${c},0 -${p / 3}px 0 ${c}`;

    // ---- 色（案ごと）
    const pal = {
      A: { accent: '#E8B93B', accentLo: '#9C7418', plate: '#14121c', text: '#FFE08A', mark: '#E8B93B', emblemBg: '#14121c', emblem: '#FFD54F' },
      B: { accent: '#F3E3B3', accentLo: '#C0392B', plate: '#F3E3B3', text: '#3A2A26', mark: '#C0392B', emblemBg: '#C0392B', emblem: '#F3E3B3' },
      C: { accent: '#FFF6E4', accentLo: '#D9C8A4', plate: '#FFF6E4', text: '#3A2A26', mark: '#F27AA8', emblemBg: '#F27AA8', emblem: '#FFF6E4' },
    }[S as 'A' | 'B' | 'C'];

    this.root.style.cssText = `position:fixed;top:${H.barTopPx}px;left:50%;transform:translateX(-50%);width:min(${H.barWidthVw}vw,${H.barMaxPx}px);z-index:40;pointer-events:none;font-family:system-ui,sans-serif`;
    this.shaker = el('div', 'display:flex;align-items:stretch;gap:' + 2 * p + 'px', this.root);

    // ---- もん（左の 四角）
    const plateH = Math.round(H.barNameSizePx * 1.5 + 4 * p);
    const emblemSize = plateH + 2 * p + (H.barHeightDots + 6) * p;
    const emblemOuter = el('div', `width:${emblemSize}px;flex:none;display:flex`, this.shaker);
    const emblemIn = frame(emblemOuter, [[out, 1], [inn, 1], [pal.accent, 2], [pal.accentLo, 1], [pal.emblemBg, 0]], p, '', true);
    emblemIn.style.cssText += ';flex:1;display:flex;align-items:center;justify-content:center';
    emblemIn.appendChild(pixels(SKULL, pal.emblem, Math.max(p, Math.floor((emblemSize - 8 * p) / 9))));

    // ---- 右: 名前の 札 と バー
    const col = el('div', 'flex:1;display:flex;flex-direction:column;gap:' + 2 * p + 'px;min-width:0', this.shaker);
    const head = el('div', 'display:flex;align-items:center;justify-content:space-between', col);
    const plateOuter = el('div', 'display:flex', head);
    const plate = frame(plateOuter, [[out, 1], [inn, 1], [pal.accent, 1], [pal.plate, 2]], p, '');
    plate.style.cssText += `;display:flex;align-items:center;gap:${2 * p}px;padding:${p}px ${3 * p}px`;
    if (S !== 'C') plate.appendChild(pixels(DIAMOND, pal.mark, Math.max(1, Math.round(p * 0.8))));
    else plate.appendChild(pixels(RIBBON, pal.mark, Math.max(1, Math.round(p * 0.9))));
    const name = el('span', `font:700 ${H.barNameSizePx}px/1.2 system-ui,sans-serif;letter-spacing:.18em;color:${pal.text};text-shadow:${S === 'A' ? '0 0 0 #000' : 'none'};white-space:nowrap`, plate);
    name.textContent = 'がしゃどくろ';
    if (S !== 'C') plate.appendChild(pixels(DIAMOND, pal.mark, Math.max(1, Math.round(p * 0.8))));
    this.count = el('div', `font:700 ${Math.round(H.barNameSizePx * 0.65)}px/1 system-ui,sans-serif;color:${out};text-shadow:${outline(inn)};letter-spacing:.05em`, head);

    // ---- バー
    const barOuter = el('div', 'position:relative', col);
    const layers: [string, number][] = S === 'B'
      ? [[out, 1], [inn, 1], ['#C0392B', 1], [pal.accent, 2], [inn, 1]]
      : S === 'C'
        ? [[out, 1], [inn, 1], [pal.accent, 2], [pal.accentLo, 1], [inn, 1]]
        : [[out, 1], [inn, 1], [pal.accent, 2], [pal.accentLo, 1], [inn, 1]];
    const track = frame(barOuter, layers, p, '');
    const inner = el('div', `position:relative;height:${H.barHeightDots * p}px;background:${H.barEmpty};overflow:hidden`, track);
    this.ghost = el('div', 'position:absolute;left:0;top:0;bottom:0;width:100%;background:#fff;opacity:.92', inner);
    this.fill = el('div', `position:absolute;left:0;top:0;bottom:0;width:100%;background:linear-gradient(to bottom,${H.barFillHi} 0,${H.barFillHi} ${p}px,${H.barFill} ${p}px,${H.barFill} calc(100% - ${p}px),${H.barFillLo} calc(100% - ${p}px),${H.barFillLo} 100%)`, inner);
    // 区切り（体力の 1/barSegments ごとに 紺の すじ）
    if (H.barSegments > 1) {
      const w = 100 / H.barSegments;
      el('div', `position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0,transparent calc(${w}% - ${p}px),${inn} calc(${w}% - ${p}px),${inn} ${w}%)`, inner);
    }
    // 骨の 枠: 両はしの ふくらみ（骨の 先）
    if (S === 'C') {
      for (const side of ['left', 'right']) for (const v of ['top', 'bottom']) {
        el('div', `position:absolute;${side}:${-2 * p}px;${v}:${-2 * p}px;width:${3 * p}px;height:${3 * p}px;background:${pal.accent};box-shadow:0 0 0 ${p}px ${inn},0 0 0 ${2 * p}px ${out}`, barOuter);
      }
    }
    // お札: 上下の 赤い 紙垂（しで）の ような 小さな 三角
    if (S === 'B') {
      for (const side of ['left', 'right']) el('div', `position:absolute;${side}:${3 * p}px;bottom:${-3 * p}px;width:${2 * p}px;height:${3 * p}px;background:${inn};box-shadow:${-p}px 0 0 #C0392B`, barOuter);
    }
    this.set(1, 1, false);
    this.ghost.style.transition = 'none';
    this.injectStyle();
  }

  private injectStyle(): void {
    if (document.getElementById(SHAKE_STYLE_ID)) return;
    const s = el('style');
    s.id = SHAKE_STYLE_ID;
    s.textContent = `@keyframes gbShake{0%{transform:translate(0,0);filter:brightness(1.6)}20%{transform:translate(calc(var(--gbsh)*-1),calc(var(--gbsh)*.5));filter:brightness(1.4)}40%{transform:translate(var(--gbsh),calc(var(--gbsh)*-.5))}60%{transform:translate(calc(var(--gbsh)*-.6),calc(var(--gbsh)*.3));filter:brightness(1.1)}80%{transform:translate(calc(var(--gbsh)*.3),0)}100%{transform:translate(0,0);filter:none}}`;
    document.head.appendChild(s);
  }

  /** 体力を 反映する。damaged = いま 当たった（ゆらす・白い 残りを おくらせる）。instant = すぐに（もどす とき） */
  set(hp: number, max: number, damaged: boolean, instant = false): void {
    const H = T.hit;
    const r = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
    this.fill.style.transition = instant ? 'none' : 'width .08s linear';
    this.fill.style.width = `${Math.round(r * 1000) / 10}%`;
    if (instant || r >= this.ratio) {
      this.ghost.style.transition = 'none';
      this.ghost.style.width = `${Math.round(r * 1000) / 10}%`;
    } else {
      this.ghost.style.transition = `width ${H.barGhostSec}s ease-out ${H.barGhostDelaySec}s`;
      this.ghost.style.width = `${Math.round(r * 1000) / 10}%`;
    }
    this.ratio = r;
    this.count.textContent = `${Math.ceil(hp)} / ${max}`;
    this.root.dataset.hp = String(hp);
    if (damaged && !instant && H.barShakePx > 0 && !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      this.shaker.style.animation = 'none';
      void this.shaker.offsetWidth; // 作りなおして また ゆらす
      this.shaker.style.setProperty('--gbsh', `${H.barShakePx}px`);
      this.shaker.style.animation = `gbShake ${H.barShakeSec}s steps(9) 1`;
    }
  }

  destroy(): void { this.root.remove(); }
}
