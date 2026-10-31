// HOUSE-1B ② なか の 画面（左 ＝ 上から 見た 方眼〔かべは 帯〕、右（パネルに しない）＝ 屋根なしの 見本・家具の ボタン〔1 行 ⌈しゅるい ÷ 2⌉ こ。13 種は 上 7・下 6〕・えらんだ 名前・あかり）。
// 仕様 §3.2 の ② なか。置ける 所は 白、置けない 所は 赤（家具の 形が 色づく）。戸の 前の 1 マスは 足あと。
// 1E: 方眼の 中の マスなら どこでも 置ける（置けない 所の 家具は 赤。重なりは あとから 置いた 方が 上）。はみ出した 所は 方眼の はこ（かべの 帯 こみ）で 切る。
// 置いた 家具を 押す と、その 家具の すぐ そば（上、入らなければ 下）に ［とる］［↻］［↺］が 出る。家具を まわすと ついて いく。
import type { EditorController } from '../../house/editor/controller';
import { FURN_ORDER, FURNITURE, K_LANTERN, paletteColumns, type FurnKind } from '../../house/editor/furniture';
import { doorIndex, doorInside, footprint, furnitureProblems, placeProblem, topLeftOf, windowCells } from '../../house/editor/model';
import { DOOR_WALL, type Wall } from '../../house/editor/tuning';
import type { Preview3D } from '../../house/preview/preview';
import { btn, el, markSel, type BtnOpts, type TileUrls } from './dom';
import type { PressFx } from './feedback';
import { ICONS } from './icons';
import { DOOR_MARK_H, doorMark, shojiMark } from './marks';
import type { StepPanel } from './soto';
import { BAND_PX, CLUSTER } from './tuning';

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
  /** 前に そばの ボタンを 出した 家具の 番号（かわったら すべらせず すぐ うつす） */
  private clusterFor: number | null = null;
  private iconsReady = false;

  constructor(private readonly ctl: EditorController, private readonly preview: () => Preview3D, private readonly tiles: TileUrls, fx: PressFx, press: BtnOpts['onPress']) {
    this.view.dataset.testid = 'editor-preview';
    this.grid.dataset.testid = 'editor-grid';
    this.ghost.dataset.testid = 'editor-ghost';
    this.ghost.alt = '';
    this.ghost.hidden = true;
    const left = el('div', 'ed-colL ed-colL--naka');
    left.dataset.col = 'L'; // ふきだしの はばを そろえる 左の 列
    left.append(this.grid);
    const side = el('aside', 'ed-right');
    const pal = el('div', 'ed-palette');
    pal.dataset.testid = 'editor-palette';
    // 1 行 ⌈n÷2⌉ こ（9 種 ＝ 上 5・下 4、13 種 ＝ 上 7・下 6）。ふえても この 式だけで ならぶ
    pal.style.setProperty('--ed-pal-cols', String(paletteColumns(FURN_ORDER.length)));
    for (const kind of FURN_ORDER) {
      const b = btn({ cls: 'ed-fbtn', id: `furniture-${kind}`, html: '', onPress: press });
      b.title = FURNITURE[kind].name;
      b.setAttribute('aria-label', FURNITURE[kind].name);
      this.palette.set(kind, b);
      pal.append(b);
    }
    this.light = btn({ cls: 'ed-light', id: 'light', html: '', onPress: press });
    this.fname.dataset.testid = 'editor-furn-name';
    const lower = el('div', 'ed-lower');
    lower.append(this.fname, this.light);
    side.append(this.view, pal, lower);
    this.el.append(left, side);
    this.buildCluster(press);

    // 方眼: 押す・右クリック・ゴースト（マスの 上に 手を おくと 置ける 形が 見える）
    const cellOf = (e: Event): { x: number; z: number } | null => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-testid="editor-cell"]');
      return t ? { x: Number(t.dataset.x), z: Number(t.dataset.z) } : null;
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
    // 置いた 家具: 押すと えらぶ・右クリックで とる
    this.layer.addEventListener('pointerdown', (e) => {
      const i = (e.target as HTMLElement).closest<HTMLElement>('[data-testid="editor-furniture"]')?.dataset.i;
      if (e.button !== 0 || i === undefined) return;
      ctl.selectPlaced(Number(i));
      fx.play('press');
    });
    const takeAt = (e: Event): void => {
      e.preventDefault();
      const c = cellOf(e);
      const i = c ? ctl.indexAt(c.x, c.z) : Number((e.target as HTMLElement).closest<HTMLElement>('[data-testid="editor-furniture"]')?.dataset.i ?? -1);
      if (i >= 0) {
        ctl.remove(i);
        fx.play('take');
      }
    };
    this.floor.addEventListener('contextmenu', takeAt);
    this.layer.addEventListener('contextmenu', takeAt);
    // べつの 所を 押したら 家具の えらびを やめる（そばの ボタンが きえる）。方眼・ボタン・ふきだしの 上は それぞれの 動きに まかせる
    window.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target as Element | null;
        if (!t || ctl.sel.placed === null) return;
        if (t.closest('.ed-floor, .ed-layer, .ed-cluster, .ed-say, button')) return;
        ctl.clearPlaced();
      },
      true,
    );
  }

  /** 家具の そばに 出る ボタン: ［とる］と、アイコン だけの まわす 2 つ（↻ ＝ みぎ・時計まわり、↺ ＝ ひだり） */
  private buildCluster(press: BtnOpts['onPress']): void {
    const { cluster } = this;
    cluster.hidden = true;
    cluster.dataset.testid = 'editor-cluster';
    cluster.style.width = `${CLUSTER.w}px`;
    cluster.style.height = `${CLUSTER.h}px`;
    const take = btn({ cls: 'ed-cbtn ed-cbtn--take', id: 'take', html: 'とる', onPress: press });
    take.setAttribute('aria-label', 'とる');
    const turnR = btn({ cls: 'ed-cbtn ed-cbtn--icon', id: 'turnRight', html: ICONS.rotR, onPress: press });
    turnR.setAttribute('aria-label', 'みぎに まわす');
    turnR.title = 'みぎに まわす';
    const turnL = btn({ cls: 'ed-cbtn ed-cbtn--icon', id: 'turnLeft', html: ICONS.rotL, onPress: press });
    turnL.setAttribute('aria-label', 'ひだりに まわす');
    turnL.title = 'ひだりに まわす';
    cluster.append(take, turnR, turnL);
  }

  /** 方眼の マス（px）。まん中の 高さから 決める（§3.2: (まん中の 高さ − 48) ÷ 9 の 切り捨て → 48・54・61） */
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
      img.src = this.preview().furnitureImage(kind, 0, 'iso').normal;
      b.prepend(img);
    }
    const lamp = el('img');
    lamp.alt = '';
    lamp.src = this.preview().furnitureImage(K_LANTERN, 0, 'iso').normal;
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
    const placed = sel.placed !== null ? s.furniture[sel.placed] : undefined;
    const name = placed ? FURNITURE[placed.kind].name : sel.palette ? FURNITURE[sel.palette].name : '';
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
        cell.dataset.testid = 'editor-cell';
        cell.dataset.x = String(x);
        cell.dataset.z = String(z);
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
    // 家具の 層は かべの 帯 こみの はこ ぜんぶ（はみ出した 赤い 家具は 帯の 上まで 描き、はこの 外は 切る。1E）
    parts.push(lamp, this.place(this.layer, 0, 0, W, H));
    this.grid.replaceChildren(...parts, this.cluster);
  }

  private paintFurniture(): void {
    const { ctl, cell } = this;
    const s = ctl.s;
    const key = JSON.stringify([s.furniture, ctl.sel.placed, ctl.flash?.seq ?? 0, cell]);
    if (key === this.layerKey) return;
    this.layerKey = key;
    this.layer.replaceChildren();
    const B = BAND_PX;
    const bads = furnitureProblems(s);
    const flash = ctl.flash;
    s.furniture.forEach((p, i) => {
      const [fw, fd] = footprint(p.kind, p.rot);
      const art = this.preview().furnitureImage(p.kind, p.rot, 'top');
      const bad = bads[i] ?? null;
      const img = this.place(el('div', 'ed-furn'), B + p.x * cell, B + p.z * cell, fw * cell, fd * cell);
      img.dataset.testid = 'editor-furniture';
      img.dataset.kind = p.kind;
      img.dataset.x = String(p.x);
      img.dataset.z = String(p.z);
      img.dataset.rot = String(p.rot);
      img.dataset.i = String(i);
      if (bad) {
        // 赤い 家具（1E）: 置く 前の 赤い 形と 同じ 赤 ＋ しま もよう（色だけに たよらない 印。しまは 家具の 形の 中だけ）
        img.style.backgroundImage = `url(${art.ng})`;
        img.style.setProperty('--ed-mask', `url(${art.normal})`);
        img.classList.add('is-red');
        img.dataset.bad = bad;
      } else {
        img.style.backgroundImage = `url(${art.normal})`;
      }
      if (i === s.furniture.length - 1 && s.furniture.length > this.lastCount) img.classList.add('is-new');
      if (flash && flash.items.includes(i) && flash.seq !== this.lastFlash) img.classList.add('is-flash');
      this.layer.append(img);
    });
    this.lastCount = s.furniture.length;
    if (flash) this.lastFlash = flash.seq;
    const sp = ctl.sel.placed !== null ? s.furniture[ctl.sel.placed] : undefined;
    if (sp) {
      const [fw, fd] = footprint(sp.kind, sp.rot);
      this.layer.append(this.place(this.selbox, B + sp.x * cell, B + sp.z * cell, fw * cell, fd * cell)); // いちばん 上
    }
    this.layer.append(this.ghost);
  }

  /**
   * えらんだ 家具の すぐ そばに ボタンを 出す。上に 入れば 家具の 上の ふち の すぐ 上、入らなければ 下。
   * 家具は もとの マスを 中心に まわる ので、まわすたびに 家具の 見えて いる 四角（方眼の はこで 切った あと）から 決めなおして ついて いく。
   * よこは 家具の まん中に そろえ、方眼の はばに おさめる。方眼から はみ出す 側には 出さない。しっぽが 家具を さす。
   */
  private paintCluster(): void {
    const { ctl, cell: c, cluster } = this;
    const s = ctl.s;
    const at = ctl.sel.placed;
    const p = at !== null ? s.furniture[at] : undefined;
    cluster.hidden = !p;
    if (!p) {
      this.clusterFor = null;
      return;
    }
    const B = BAND_PX;
    const W = s.w * c + 2 * B;
    const H = s.d * c + 2 * B;
    const [fw, fd] = footprint(p.kind, p.rot);
    const fl = Math.max(0, B + p.x * c);
    const fr = Math.min(W, B + (p.x + fw) * c);
    const ft = Math.max(0, B + p.z * c);
    const fb = Math.min(H, B + (p.z + fd) * c);
    const { w: cw, h: ch, gap } = CLUSTER;
    const aboveTop = ft - gap - ch;
    const side = aboveTop >= 0 ? 'above' : 'below';
    const top = side === 'above' ? aboveTop : Math.min(fb + gap, H - ch);
    const mid = (fl + fr) / 2;
    const left = W >= cw ? clamp(mid - cw / 2, 0, W - cw) : (W - cw) / 2;
    const jump = at !== this.clusterFor; // べつの 家具を えらんだ: すべらせず すぐ うつす
    this.clusterFor = at;
    if (jump) cluster.style.transition = 'none';
    cluster.style.left = `${left}px`;
    cluster.style.top = `${top}px`;
    cluster.style.setProperty('--tail', `${clamp(mid - left, 24, cw - 24)}px`);
    cluster.classList.toggle('is-above', side === 'above');
    if (jump) {
      void cluster.offsetWidth; // 今の 場所を 決めて から すべりを もどす
      cluster.style.transition = '';
    }
  }

  private paintGhost(): void {
    const { ctl, hover } = this;
    const pend = ctl.pending();
    // 家具の ある マスの 上では 形を 出さない（押すと 置かずに えらぶ ため。1E）
    if (!pend || !hover || ctl.indexAt(hover.x, hover.z) >= 0) {
      this.ghost.hidden = true;
      return;
    }
    // 押した マス ＝ もとの マス（置く 前の 向きが 0 で なくても。1E）。赤くても 押せる
    const at = topLeftOf(pend.kind, pend.rot, hover.x, hover.z);
    const p = { kind: pend.kind, x: at.x, z: at.z, rot: pend.rot };
    const bad = placeProblem(ctl.s, p);
    const img = this.preview().furnitureImage(p.kind, p.rot, 'top');
    const src = bad === null ? img.ok : img.ng;
    if (src !== this.ghostSrc) {
      this.ghostSrc = src;
      this.ghost.src = src;
    }
    if (bad === null) delete this.ghost.dataset.bad;
    else this.ghost.dataset.bad = bad;
    const [fw, fd] = footprint(p.kind, p.rot);
    this.place(this.ghost, BAND_PX + p.x * this.cell, BAND_PX + p.z * this.cell, fw * this.cell, fd * this.cell);
    this.ghost.hidden = false;
    if (!this.ghost.isConnected) this.layer.append(this.ghost);
  }
}
