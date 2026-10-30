// HOUSE-1B 試作: ② なか の 画面（左 6 わり ＝ 上から 見た 方眼〔かべは 帯〕、右 4 わり ＝ 屋根なしの 見本・家具 9 種・えらんだ 名前・あかり・とる／まわす）。
// 仕様 §3.2 の ② なか。置ける 所は 白、置けない 所は 赤（家具の 形が 色づく）。戸の 前の 1 マスは 足あと。
import { btn, el, markSel, setOff, type TileUrls } from './dom';
import type { EditorController } from './editor';
import { ICONS } from './icons';
import { doorInside, footprint, placeProblem, wallLength, windowCells } from './model';
import type { Preview3D } from './preview';
import { BAND_PX, FURN_ORDER, FURNITURE, type FurnKind, type Wall } from './tuning';
import type { StepPanel } from './uiSoto';

export class NakaPanel implements StepPanel {
  readonly el: HTMLElement = el('section', 'ed-stepview ed-stepview--naka');
  readonly view: HTMLElement = el('div', 'ed-view');
  private readonly grid = el('div', 'ed-grid');
  private readonly floor = el('div', 'ed-floor');
  private readonly layer = el('div', 'ed-layer');
  private readonly ghost = el('img', 'ed-ghost');
  private readonly selbox = el('div', 'ed-selbox');
  private readonly palette = new Map<FurnKind, HTMLButtonElement>();
  private readonly fname = el('p', 'ed-fname');
  private readonly light: HTMLButtonElement;
  private readonly take: HTMLButtonElement;
  private readonly turnR: HTMLButtonElement;
  private readonly turnL: HTMLButtonElement;
  private cell = 48;
  private shape = '';
  private layerKey = '';
  private ghostSrc = '';
  private hover: { x: number; z: number } | null = null;
  private lastCount = 0;
  private lastFlash = 0;
  private iconsReady = false;

  constructor(private readonly ctl: EditorController, private readonly preview: Preview3D, private readonly tiles: TileUrls) {
    this.view.dataset.testid = 'editor-preview';
    this.grid.dataset.testid = 'editor-grid';
    this.ghost.alt = '';
    this.ghost.hidden = true;
    const left = el('div', 'ed-left');
    left.append(this.grid);
    const side = el('aside', 'ed-side');
    const pal = el('div', 'ed-palette');
    pal.dataset.testid = 'editor-palette';
    for (const kind of FURN_ORDER) {
      const b = btn({ cls: 'ed-fbtn', html: '', testid: `editor-furn-${kind}`, onClick: () => ctl.selectPalette(kind) });
      b.title = FURNITURE[kind].name;
      b.setAttribute('aria-label', FURNITURE[kind].name);
      this.palette.set(kind, b);
      pal.append(b);
    }
    this.light = btn({ cls: 'ed-light', html: '', testid: 'editor-light', onClick: () => ctl.selectLight() });
    this.take = btn({ html: 'とる', testid: 'editor-take', onClick: () => void ctl.takeSelected() });
    this.turnR = btn({ html: `${ICONS.rotR}<span>みぎ</span>`, testid: 'editor-turn-right', onClick: () => void ctl.turnSelected('right') });
    this.turnL = btn({ html: `${ICONS.rotL}<span>ひだり</span>`, testid: 'editor-turn-left', onClick: () => void ctl.turnSelected('left') });
    const acts = el('div', 'ed-acts');
    acts.append(this.take, this.turnR, this.turnL);
    this.fname.dataset.testid = 'editor-furn-name';
    side.append(this.view, pal, this.fname, this.light, acts);
    this.el.append(left, side);

    // 方眼: 押す・右クリック・ゴースト（マスの 上に 手を おくと 置ける 形が 見える）
    const cellOf = (e: Event): { x: number; z: number } | null => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]');
      if (!t) return null;
      const [x, z] = t.dataset.cell!.split(',').map(Number);
      return { x: x!, z: z! };
    };
    this.floor.addEventListener('pointermove', (e) => {
      this.hover = cellOf(e);
      this.paintGhost();
    });
    this.floor.addEventListener('pointerleave', () => {
      this.hover = null;
      this.paintGhost();
    });
    this.floor.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const c = cellOf(e);
      if (!c) return;
      // 置いた 直後は ゴーストを かくす（置いた 家具が 見える ように。手を うごかすと また 出る）
      if (ctl.clickCell(c.x, c.z)) {
        this.hover = null;
        this.paintGhost();
      }
    });
    this.floor.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const c = cellOf(e);
      const i = c ? ctl.indexAt(c.x, c.z) : -1;
      if (i >= 0) ctl.remove(i);
    });
  }

  /** 方眼の マス（px）。画面の 高さから 決める（§3.2: (まん中の 高さ − 48) ÷ 9 の 切り捨て） */
  setCell(px: number): void {
    if (px === this.cell) return;
    this.cell = px;
    this.shape = '';
    this.layerKey = '';
  }

  /** 家具の 絵（ボタン用の ななめ絵）は ひらく とき 1 回 作る */
  private ensureIcons(): void {
    if (this.iconsReady) return;
    this.iconsReady = true;
    for (const [kind, b] of this.palette) {
      const img = el('img');
      img.alt = '';
      img.src = this.preview.furnitureImage(kind, 0, 'iso').normal;
      b.prepend(img);
    }
    const lamp = el('img');
    lamp.alt = '';
    lamp.src = this.preview.furnitureImage('lantern', 0, 'iso').normal;
    this.light.append(lamp, el('span', '', 'あかり'), el('small', '', 'ちょうちん'));
  }

  update(): void {
    this.ensureIcons();
    const s = this.ctl.s;
    const key = `${s.w}|${s.d}|${s.door}|${s.windows}|${this.cell}`;
    if (key !== this.shape) {
      this.shape = key;
      this.rebuildGrid();
      this.layerKey = '';
    }
    this.paintFurniture();
    this.paintGhost();
    const sel = this.ctl.sel;
    for (const [k, b] of this.palette) markSel(b, sel.palette === k);
    markSel(this.light, sel.light);
    const placed = sel.placed !== null ? s.furniture[sel.placed] : undefined;
    const name = placed ? FURNITURE[placed.kind].name : sel.palette ? FURNITURE[sel.palette].name : sel.light ? 'あかり' : '';
    this.fname.textContent = name || 'かぐを えらんでね';
    this.fname.style.color = name ? '' : 'var(--rk-text-sub)';
    setOff(this.take, sel.placed === null && !sel.light);
    setOff(this.turnR, sel.placed === null && sel.palette === null);
    setOff(this.turnL, sel.placed === null && sel.palette === null);
  }

  // ------------------------------------------------------------ 方眼

  private place(e: HTMLElement, left: number, top: number, w: number, h: number): HTMLElement {
    e.style.left = `${left}px`;
    e.style.top = `${top}px`;
    e.style.width = `${w}px`;
    e.style.height = `${h}px`;
    return e;
  }

  private rebuildGrid(): void {
    const s = this.ctl.s;
    if (s.w === null || s.d === null) {
      this.grid.replaceChildren();
      return;
    }
    const { w, d } = s;
    const c = this.cell;
    const t = this.tiles;
    const B = BAND_PX;
    const W = w * c + 2 * B;
    const H = d * c + 2 * B;
    this.grid.style.width = `${W}px`;
    this.grid.style.height = `${H}px`;
    const band = (left: number, top: number, bw: number, bh: number, url: string, size: string, pos: string): HTMLElement => {
      const b = this.place(el('div', 'ed-band'), left, top, bw, bh);
      b.style.backgroundImage = `url(${url})`;
      b.style.backgroundSize = size;
      b.style.backgroundPosition = pos;
      return b;
    };
    const parts: HTMLElement[] = [
      band(0, 0, W, B, t.wallH, `${c}px ${B}px`, `${B}px 0`),
      band(0, B + d * c, W, B, t.wallH, `${c}px ${B}px`, `${B}px 0`),
      band(0, B, B, d * c, t.wallV, `${B}px ${c}px`, '0 0'),
      band(B + w * c, B, B, d * c, t.wallV, `${B}px ${c}px`, '0 0'),
    ];
    // かべの 帯の 印: 窓（しょうじ）と 戸
    const wallMark = (wall: Wall, i: number, kind: 'shoji' | 'door'): HTMLElement => {
      const horiz = wall === 'front' || wall === 'back';
      const url = kind === 'door' ? (horiz ? t.doorH : t.doorV) : horiz ? t.shojiH : t.shojiV;
      const m = el('div', `ed-mark ed-mark--wall ed-mark--${kind}`);
      if (horiz) this.place(m, B + i * c, wall === 'front' ? B + d * c : 0, c, B);
      else this.place(m, wall === 'right' ? B + w * c : 0, B + i * c, B, c);
      m.style.backgroundImage = `url(${url})`;
      return m;
    };
    for (const wc of windowCells(s)) parts.push(wallMark(wc.wall, wc.i, 'shoji'));
    parts.push(wallMark(s.door, (wallLength(w, d, s.door) - 1) / 2, 'door'));
    // ゆか（マスは ただの div。押す・手を おく 先）
    this.place(this.floor, B, B, w * c, d * c);
    this.floor.style.gridTemplateColumns = `repeat(${w}, ${c}px)`;
    this.floor.style.gridAutoRows = `${c}px`;
    this.floor.style.backgroundImage = `url(${t.floor})`;
    this.floor.style.backgroundSize = `${c}px ${c}px`;
    const cells: HTMLElement[] = [];
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const cell = el('div', 'ed-cell');
        cell.dataset.cell = `${x},${z}`;
        cells.push(cell);
      }
    }
    this.floor.replaceChildren(...cells);
    parts.push(this.floor);
    // 戸の 前の 足あと・天井の ちょうちんの 印（方眼の まん中）
    const foot = doorInside(s);
    if (foot) parts.push(this.place(el('div', 'ed-mark ed-mark--foot', ICONS.foot), B + foot.x * c, B + foot.z * c, c, c));
    const lamp = this.place(el('div', 'ed-mark ed-mark--lamp', ICONS.lantern), B + ((w - 1) / 2) * c, B + ((d - 1) / 2) * c, c, c);
    lamp.dataset.testid = 'editor-lamp-mark';
    parts.push(lamp, this.place(this.layer, B, B, w * c, d * c));
    this.grid.replaceChildren(...parts);
  }

  private paintFurniture(): void {
    const { ctl, cell } = this;
    const s = ctl.s;
    const key = JSON.stringify([s.furniture, ctl.sel.placed, ctl.flash?.seq ?? 0, cell]);
    if (key === this.layerKey) return;
    this.layerKey = key;
    this.layer.replaceChildren();
    s.furniture.forEach((p, i) => {
      const [fw, fd] = footprint(p.kind, p.rot);
      const img = this.place(el('img', 'ed-furn'), p.x * cell, p.z * cell, fw * cell, fd * cell) as HTMLImageElement;
      img.alt = '';
      img.src = this.preview.furnitureImage(p.kind, p.rot, 'top').normal;
      img.dataset.i = String(i);
      if (i === s.furniture.length - 1 && s.furniture.length > this.lastCount) img.classList.add('is-new');
      if (ctl.flash && ctl.flash.idx === i && ctl.flash.seq !== this.lastFlash) img.classList.add('is-flash');
      this.layer.append(img);
    });
    this.lastCount = s.furniture.length;
    if (ctl.flash) this.lastFlash = ctl.flash.seq;
    const sp = ctl.sel.placed !== null ? s.furniture[ctl.sel.placed] : undefined;
    if (sp) {
      const [fw, fd] = footprint(sp.kind, sp.rot);
      this.layer.append(this.place(this.selbox, sp.x * cell, sp.z * cell, fw * cell, fd * cell));
    }
    this.layer.append(this.ghost);
  }

  private paintGhost(): void {
    const pend = this.ctl.pending();
    if (!pend || !this.hover) {
      this.ghost.hidden = true;
      return;
    }
    const p = { kind: pend.kind, x: this.hover.x, z: this.hover.z, rot: pend.rot };
    const img = this.preview.furnitureImage(p.kind, p.rot, 'top');
    const src = placeProblem(this.ctl.s, p) === null ? img.ok : img.ng;
    if (src !== this.ghostSrc) {
      this.ghostSrc = src;
      this.ghost.src = src;
    }
    const [fw, fd] = footprint(p.kind, p.rot);
    this.place(this.ghost, p.x * this.cell, p.z * this.cell, fw * this.cell, fd * this.cell);
    this.ghost.hidden = false;
    if (!this.ghost.isConnected) this.layer.append(this.ghost);
  }
}
