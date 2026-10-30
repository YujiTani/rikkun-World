// HOUSE-1B 試作: ② なか の 画面（左 ＝ 上から 見た 方眼〔かべは 帯〕、右（パネルに しない）＝ 屋根なしの 見本・家具の ボタン〔1 行 7 こまで。9 種は 上 5・下 4〕・えらんだ 名前・あかり）。
// 仕様 §3.2 の ② なか。置ける 所は 白、置けない 所は 赤（家具の 形が 色づく）。戸の 前の 1 マスは 足あと。
// 置いた 家具を 押す と、その 家具の すぐ そば（下、はみ出す ときは 上）に ［とる］［↻］［↺］が 出る。家具を まわすと ついて いく。
import { btn, el, markSel, type TileUrls } from './dom';
import type { EditorController } from './editor';
import type { PressFx } from './feedback';
import { ICONS } from './icons';
import { DOOR_MARK_H, doorMark, shojiMark } from './marks';
import { doorIndex, doorInside, footprint, placeProblem, windowCells } from './model';
import type { Preview3D } from './preview';
import { BAND_PX, CLUSTER, DOOR_WALL, FURN_ORDER, FURNITURE, type FurnKind, type Wall } from './tuning';
import { bindDrag } from './uiDrag';
import type { StepPanel } from './uiSoto';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export class NakaPanel implements StepPanel {
  readonly el: HTMLElement = el('section', 'ed-stepview ed-stepview--naka');
  readonly view: HTMLElement = el('div', 'ed-view');
  private readonly grid = el('div', 'ed-grid');
  private readonly floor = el('div', 'ed-floor');
  private readonly layer = el('div', 'ed-layer');
  private readonly ghost = el('img', 'ed-ghost');
  private readonly selbox = el('div', 'ed-selbox');
  private readonly cluster = el('div', 'ed-cluster');
  private readonly palette = new Map<FurnKind, HTMLButtonElement>();
  private readonly fname = el('p', 'ed-fname');
  private readonly light: HTMLButtonElement;
  private cell = 48;
  private shape = '';
  private layerKey = '';
  private ghostSrc = '';
  private hover: { x: number; z: number } | null = null;
  private lastCount = 0;
  private lastFlash = 0;
  private iconsReady = false;

  constructor(private readonly ctl: EditorController, private readonly preview: Preview3D, private readonly tiles: TileUrls, fx: PressFx) {
    this.view.dataset.testid = 'editor-preview';
    bindDrag(this.view, preview);
    this.grid.dataset.testid = 'editor-grid';
    this.ghost.alt = '';
    this.ghost.hidden = true;
    const left = el('div', 'ed-colL ed-colL--naka');
    left.dataset.col = 'L'; // ふきだしの はばを そろえる 左の 列
    left.append(this.grid);
    const side = el('aside', 'ed-right');
    const pal = el('div', 'ed-palette');
    pal.dataset.testid = 'editor-palette';
    // 1 行 ceil(n÷2) こ（9 種 ＝ 上 5・下 4、13 種 ＝ 上 7・下 6）。ふえても この 式だけで ならぶ
    pal.style.setProperty('--ed-pal-cols', String(Math.ceil(FURN_ORDER.length / 2)));
    for (const kind of FURN_ORDER) {
      const b = btn({ cls: 'ed-fbtn', html: '', testid: `editor-furn-${kind}`, onClick: () => ctl.selectPalette(kind) });
      b.title = FURNITURE[kind].name;
      b.setAttribute('aria-label', FURNITURE[kind].name);
      this.palette.set(kind, b);
      pal.append(b);
    }
    this.light = btn({ cls: 'ed-light', html: '', testid: 'editor-light', onClick: () => ctl.selectLight() });
    this.fname.dataset.testid = 'editor-furn-name';
    const lower = el('div', 'ed-lower');
    lower.append(this.fname, this.light);
    side.append(this.view, pal, lower);
    this.el.append(left, side);
    this.buildCluster();

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
        fx.play('press'); // 置く・えらぶ ＝ 小さな 木の 音（置いた 家具は ぴょこんと 出る）
        this.hover = null;
        this.paintGhost();
      }
    });
    this.floor.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const c = cellOf(e);
      const i = c ? ctl.indexAt(c.x, c.z) : -1;
      if (i >= 0) {
        ctl.remove(i);
        fx.play('take');
      }
    });
    // べつの 所を 押したら 家具の えらびを やめる（そばの ボタンが きえる）。方眼・ボタン・ふきだしの 上は それぞれの 動きに まかせる
    window.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target as Element | null;
        if (!t || ctl.sel.placed === null) return;
        if (t.closest('.ed-floor, .ed-cluster, .ed-say, button')) return;
        ctl.clearPlaced();
      },
      true,
    );
  }

  /** 家具の そばに 出る ボタン: ［とる］と、アイコン だけの まわす 2 つ（↻ ＝ みぎ・時計まわり、↺ ＝ ひだり） */
  private buildCluster(): void {
    const { ctl, cluster } = this;
    cluster.hidden = true;
    cluster.dataset.testid = 'editor-cluster';
    cluster.style.width = `${CLUSTER.w}px`;
    cluster.style.height = `${CLUSTER.h}px`;
    const take = btn({ cls: 'ed-cbtn ed-cbtn--take', html: 'とる', testid: 'editor-take', onClick: () => void ctl.takeSelected() });
    const turnR = btn({ cls: 'ed-cbtn ed-cbtn--icon', html: ICONS.rotR, testid: 'editor-turn-right', onClick: () => void ctl.turnSelected('right') });
    turnR.setAttribute('aria-label', 'みぎに まわす');
    turnR.title = 'みぎに まわす';
    const turnL = btn({ cls: 'ed-cbtn ed-cbtn--icon', html: ICONS.rotL, testid: 'editor-turn-left', onClick: () => void ctl.turnSelected('left') });
    turnL.setAttribute('aria-label', 'ひだりに まわす');
    turnL.title = 'ひだりに まわす';
    cluster.append(take, turnR, turnL);
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
    const key = `${s.w}|${s.d}|${s.windows}|${this.cell}`;
    if (key !== this.shape) {
      this.shape = key;
      this.rebuildGrid();
      this.layerKey = '';
    }
    this.paintFurniture();
    this.paintGhost();
    this.paintCluster();
    const sel = this.ctl.sel;
    for (const [k, b] of this.palette) markSel(b, sel.palette === k);
    markSel(this.light, sel.light);
    const placed = sel.placed !== null ? s.furniture[sel.placed] : undefined;
    const name = placed ? FURNITURE[placed.kind].name : sel.palette ? FURNITURE[sel.palette].name : sel.light ? 'あかり' : '';
    this.fname.textContent = name || 'かぐを えらぼう'; // 7 字 ＋ 空白 ＝ 176 に おさまる 長さ
    this.fname.style.color = name ? '' : 'var(--rk-text-sub)';
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
    // かべの 帯の 印: 窓 ＝ 白い しょうじ（帯に そって 1 マスより 少し 小さく）
    const bandRect = (wall: Wall, i: number): { x: number; y: number; w: number; h: number; horiz: boolean } => {
      const horiz = wall === 'front' || wall === 'back';
      if (horiz) return { x: B + i * c, y: wall === 'front' ? B + d * c : 0, w: c, h: B, horiz };
      return { x: wall === 'right' ? B + w * c : 0, y: B + i * c, w: B, h: c, horiz };
    };
    for (const wc of windowCells(s)) {
      const r = bandRect(wc.wall, wc.i);
      const len = (r.horiz ? r.w : r.h) - 4; // 1 マスの はば（となりと 4 あける）
      const m = el('div', 'ed-mark ed-mark--window', shojiMark(len, B, r.horiz));
      m.dataset.testid = 'editor-mark-window';
      parts.push(this.place(m, r.x + (r.horiz ? 2 : 0), r.y + (r.horiz ? 0 : 2), r.horiz ? len : B, r.horiz ? B : len));
    }
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
    // 戸の 前の 足あと・戸の 絵（1 マスの はば × 24 ＝ 帯 16 ＋ 外へ 8。帯の 上から 外へ はみ出す）・天井の ちょうちんの 印（方眼の まん中）
    const door = bandRect(DOOR_WALL, doorIndex(s));
    const foot = doorInside(s);
    parts.push(this.place(el('div', 'ed-mark ed-mark--foot', ICONS.foot), B + foot.x * c, B + foot.z * c, c, c));
    const dw = door.w - 4;
    const dm = el('div', 'ed-mark ed-mark--door', doorMark(dw));
    dm.dataset.testid = 'editor-mark-door';
    parts.push(this.place(dm, door.x + 2, door.y, dw, DOOR_MARK_H));
    const lamp = this.place(el('div', 'ed-mark ed-mark--lamp', ICONS.lantern), B + ((w - 1) / 2) * c, B + ((d - 1) / 2) * c, c, c);
    lamp.dataset.testid = 'editor-lamp-mark';
    parts.push(lamp, this.place(this.layer, B, B, w * c, d * c));
    this.grid.replaceChildren(...parts, this.cluster);
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

  /**
   * えらんだ 家具の すぐ そばに ボタンを 出す。まわしても 動かない 場所（左上の マスは かわらない）に きめる ので、
   * つづけて ↻ を 押せる（ボタンが ゆびの 下から にげない）。しっぽと わくが 家具に ついて いく。
   * 上に 入れば 家具の 上の ふち の すぐ 上、入らなければ 下（2 マスの 家具は まわした どの 向きでも おさまる 2×2 の 下）。
   * よこは そのまま 方眼の はばに おさめる。方眼から はみ出す 側には 出さない。
   */
  private paintCluster(): void {
    const { ctl, cell: c, cluster } = this;
    const s = ctl.s;
    const p = ctl.sel.placed !== null ? s.furniture[ctl.sel.placed] : undefined;
    cluster.hidden = !p;
    if (!p) return;
    const B = BAND_PX;
    const W = s.w * c + 2 * B;
    const H = s.d * c + 2 * B;
    const [fw, fd] = footprint(p.kind, p.rot);
    const m = Math.max(fw, fd);
    const x0 = B + p.x * c;
    const top0 = B + p.z * c;
    const { w: cw, h: ch, gap } = CLUSTER;
    const aboveTop = top0 - gap - ch;
    const side = aboveTop >= 0 ? 'above' : 'below';
    const top = side === 'above' ? aboveTop : Math.min(top0 + m * c + gap, H - ch);
    const left = W >= cw ? clamp(x0 + (m * c) / 2 - cw / 2, 0, W - cw) : (W - cw) / 2;
    cluster.style.left = `${left}px`;
    cluster.style.top = `${top}px`;
    cluster.style.setProperty('--tail', `${clamp(x0 + (fw * c) / 2 - left, 24, cw - 24)}px`);
    cluster.classList.toggle('is-above', side === 'above');
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
