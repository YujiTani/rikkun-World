// HOUSE-1B エディターの 持ち主（作りかけ・もどす／すすむ・できた！の しらべ・ふきだし）。DOM・three なし。
// 仕様 docs/design/HOUSE-1.md §2.5（すすみ方・できた！・もどす／すすむ・Esc の 順・赤い 家具〔1E〕）・§2.6（名前）・§4.9（ふきだしの 長さ）。
import type { ItemId } from '../../contracts';
import { K_FUTON, FURNITURE, type FurnKind } from './furniture';
import {
  cloneState, dakuten, emptyState, footprint, furnitureProblems, handakuten, inGrid, needOf, refit, topLeftOf, touchesGrid, turned, windowMax,
  type EditorState, type NeedRow, type Placed,
} from './model';
import { NameEdit } from './nameEdit';
import { hasNgName } from './ngWords';
import {
  BUBBLE, MSG, ROOF_KINDS, SIZES, WINDOW_KINDS,
  type RoofKind, type Rot, type Size, type Step, type WindowKind,
} from './tuning';

export type Confirm = null | 'reset' | 'futonOnly';

/** 家具の えらび: palette ＝ 右の 一覧から えらんだ 種類（置く 前）、placed ＝ 置いた 家具の 番号 */
export interface Selection {
  palette: FurnKind | null;
  placed: number | null;
}

/** できた！の ④〜⑥ と せっけいずを 作る 所（持ち物・くらを 読み書きする 係。house/editor/sheet.ts） */
export interface SheetPort {
  /** ④ かみ ⑤ ふで ⑥ 持ち物に 空きが ない。ひっかかる 1 つ目。通れば null */
  problem(): 'paper' | 'fude' | 'full' | null;
  /** かみ 1・ふでの たいきゅう 1 を 使って せっけいずを 持ち物に 入れる（problem() が null の とき だけ 呼ぶ） */
  make(draft: Readonly<EditorState>): void;
}

export interface EditorHost {
  /** 作りかけ（HouseState が 持ち、保存に 入る。コントローラーは 中身を 入れかえる） */
  holder: { draft: EditorState };
  /** くらの 数（「ひつような もの」の くら） */
  have: (item: ItemId) => number;
  sheet: SheetPort;
  /** せっけいずが できた（メニューの 上の ページへ もどし、ふきだしを 出す） */
  onMade: () => void;
}

interface HistoryItem {
  before: EditorState;
  after: EditorState;
  /** この 操作が 属する すすみ（もどすと この すすみへ 切りかわる） */
  step: Step;
}

/** 赤く 光らせた 家具（1E。フックの `flash` と 同じ 形）。items ＝ furniture の 番号、seq ＝ 光らせる たびに 1 ふえる 数 */
export interface Flash {
  items: number[];
  seq: number;
}

export interface Bubble {
  text: string;
  /** のこりの コマ（1/60 秒）。0 で 消える */
  left: number;
  /** 出した 通し番号（同じ 文を 続けて 出しても 出しなおす ため） */
  seq: number;
}

export class EditorController {
  sel: Selection = { palette: null, placed: null };
  /** 「あたらしい せっけいず → ぜんぶ けす」を した 回数（見本の 向きを はじめに もどす ため） */
  resets = 0;
  katakana = false;
  confirm: Confirm = null;
  needOpen = false;
  bubble: Bubble | null = null;
  /** 赤く 1 回 光らせる 家具（つぎへ・できた！で 止まった とき・まわせなかった とき）。まだ 光らせて いなければ null */
  flash: Flash | null = null;
  /** 中身が かわった たびに ふえる 数（画面の 描きなおしの 目印） */
  version = 0;
  private undos: HistoryItem[] = [];
  private redos: HistoryItem[] = [];
  private seq = 0;
  /** flash.seq の 数え（ふきだしの 通し番号とは べつ。エディターを 開きなおしても もどらない） */
  private flashSeq = 0;
  private readonly listeners: Array<() => void> = [];
  private readonly names = new NameEdit({ state: () => this.s, commit: (next) => this.commit(next, 'namae'), say: (text) => this.say(text) });

  constructor(private readonly h: EditorHost) {}

  /** 作りかけ（読むだけ。かえる ときは 下の 操作を 通す） */
  get s(): EditorState {
    return this.h.holder.draft;
  }
  private set s(next: EditorState) {
    this.h.holder.draft = next;
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /**
   * エディターを 開く: 見本の 向きや 家具の えらびは 作りかけに 入らないので、えらびと ポップアップを まっさらに（もどす の 記録は のこす）。
   * 読みこんだ 作りかけに 赤い 家具が あれば、とじた ときの すすみに よらず ② なか で 開く（1E。よくない ことばより 先）。
   * 名前に よくない ことばが あれば（表が あとで ふえた など）、すすみに よらず ③ なまえ で 開いて ふきだし（§2.6）
   */
  open(): void {
    this.sel = { palette: null, placed: null };
    this.confirm = null;
    this.needOpen = false;
    this.bubble = null;
    this.flash = null;
    this.katakana = false;
    if (this.redItems().length > 0) {
      this.s.step = 'naka';
      this.emit();
      return;
    }
    if (hasNgName(this.s.name)) {
      this.s.step = 'namae';
      this.say(MSG.ngWord);
      return;
    }
    this.emit();
  }

  /** 保存から 読みなおした: もどす の 記録は すてる */
  loaded(): void {
    this.undos = [];
    this.redos = [];
    this.open();
  }

  // ------------------------------------------------------------ 聞く

  canUndo(): boolean {
    return this.undos.length > 0;
  }
  canRedo(): boolean {
    return this.redos.length > 0;
  }
  windowMax(): number {
    return windowMax(this.s);
  }
  need(): NeedRow[] {
    return needOf(this.s, this.h.have);
  }
  /** ゛・゜ が いま 押せる か */
  canMark(kind: 'dakuten' | 'handakuten'): boolean {
    const last = [...this.s.name.front].pop();
    if (!last) return false;
    return (kind === 'dakuten' ? dakuten(last) : handakuten(last)) !== null;
  }
  /** 一覧から えらんだ 家具の 形（ゴースト用。置く 前は 向き 0。まわすのは 置いた あと）。なければ null */
  pending(): { kind: FurnKind; rot: Rot } | null {
    return this.sel.palette ? { kind: this.sel.palette, rot: 0 } : null;
  }
  /** えらんで いる 置いた 家具（なければ null） */
  selected(): Placed | null {
    return this.sel.placed === null ? null : (this.s.furniture[this.sel.placed] ?? null);
  }
  /** 赤い 家具の 番号（置いた 順。赤い わけは 形から 毎回 決まる。1E） */
  redItems(): number[] {
    const out: number[] = [];
    furnitureProblems(this.s).forEach((bad, i) => {
      if (bad !== null) out.push(i);
    });
    return out;
  }

  // ------------------------------------------------------------ ふきだし

  say(text: string): void {
    this.seq++;
    const chars = [...text].filter((c) => !/\s/.test(c)).length;
    this.bubble = { text, left: BUBBLE.baseFrames + BUBBLE.perCharFrames * chars, seq: this.seq };
    this.emit();
  }
  hideBubble(): void {
    if (!this.bubble) return;
    this.bubble = null;
    this.emit();
  }

  /** 1 コマ（1/60 秒。ゲームの 時間が 止まって いても すすむ）。ふきだしの 時間 */
  tick(): void {
    if (!this.bubble) return;
    if (--this.bubble.left <= 0) this.hideBubble();
  }

  // ------------------------------------------------------------ 操作（もどす の 1 回に なる もの）

  /** 状態を かえて 履歴に 積む。かわらなければ 何もしない（false） */
  private commit(next: EditorState, step: Step): boolean {
    if (JSON.stringify(next) === JSON.stringify(this.s)) return false;
    this.undos.push({ before: cloneState(this.s), after: cloneState(next), step });
    this.redos = [];
    next.step = this.s.step;
    this.s = next;
    this.fixSelection();
    this.emit();
    return true;
  }

  private fixSelection(): void {
    if (this.sel.placed !== null && this.sel.placed >= this.s.furniture.length) this.sel.placed = null;
  }

  setSize(patch: { w?: number; d?: number }): boolean {
    const { w, d } = patch;
    if ((w !== undefined && !SIZES.includes(w as Size)) || (d !== undefined && !SIZES.includes(d as Size))) return false;
    const next = cloneState(this.s);
    if (w !== undefined) next.w = w as Size;
    if (d !== undefined) next.d = d as Size;
    const r = refit(this.s, next);
    const ok = this.commit(r.state, 'soto');
    if (ok && r.dropped > 0) this.say(MSG.tidy);
    return ok;
  }

  windows(delta: 1 | -1): boolean {
    const n = this.s.windows + delta;
    if (n < 0 || n > this.windowMax()) return false;
    const next = cloneState(this.s);
    next.windows = n;
    return this.commit(next, 'soto');
  }

  /** 窓の しゅるい・屋根の しゅるい（ボタンの ならびに ある 物だけ。今と 同じ 物は 何も かわらない = false） */
  setWindowKind(kind: WindowKind): boolean {
    if (!WINDOW_KINDS.includes(kind)) return false;
    const next = cloneState(this.s);
    next.windowKind = kind;
    return this.commit(next, 'soto');
  }

  setRoof(kind: RoofKind): boolean {
    if (!ROOF_KINDS.includes(kind)) return false;
    const next = cloneState(this.s);
    next.roof = kind;
    return this.commit(next, 'soto');
  }

  /**
   * 置く。x・z ＝ 押した マス ＝ もとの マス（rot が あっても。1E）。方眼の 中の マスなら はみ出す・重なる・戸の 前 でも 置ける（赤くなる）。
   * 方眼の 外の マス・もう 家具が ある マスは 置かない（false。画面では 家具の ある マスは えらぶ）
   */
  place(kind: FurnKind, x: number, z: number, rot: Rot = 0): boolean {
    if (!(kind in FURNITURE) || !inGrid(this.s, x, z) || this.indexAt(x, z) >= 0) return false;
    const at = topLeftOf(kind, rot, x, z);
    const next = cloneState(this.s);
    next.furniture.push({ kind, x: at.x, z: at.z, rot });
    return this.commit(next, 'naka');
  }

  remove(idx: number): boolean {
    if (idx < 0 || idx >= this.s.furniture.length) return false;
    const next = cloneState(this.s);
    next.furniture.splice(idx, 1);
    const ok = this.commit(next, 'naka');
    if (ok) this.clearPlaced();
    return ok;
  }

  /**
   * 置いた 家具を もとの マスを 中心に まわす。赤く なる 向きにも まわる（1E）。
   * 方眼に 1 マスも 入らなく なる とき（もとの マスが 方眼の 外に のこった 家具）だけ まわらず、赤く 1 回 光る
   */
  rotate(idx: number, dir: 'right' | 'left'): boolean {
    const p = this.s.furniture[idx];
    if (!p) return false;
    const to = turned(p, dir);
    if (!touchesGrid(this.s, to)) {
      this.lightUp([idx]);
      return false;
    }
    const next = cloneState(this.s);
    next.furniture[idx] = to;
    return this.commit(next, 'naka');
  }

  /** 赤い 家具を 1 回 光らせる（番号の ならび）。光らせる たびに seq が 1 ふえる */
  private lightUp(items: number[]): void {
    this.flash = { items, seq: ++this.flashSeq };
    this.emit();
  }

  /** 赤い 家具が ある まま すすめない: 赤い 家具 ぜんぶを 光らせて ふきだし（もどす の 1 回には 入らない） */
  private stopRed(red: number[]): void {
    this.flash = { items: red, seq: ++this.flashSeq };
    this.say(MSG.fixRed);
  }

  /** あかりを 押す: ちょうちんは はずせない（何も かわらない・もどす にも 入らない） */
  lightTouched(): void {
    this.say(MSG.light);
  }

  // 名前を かえる 操作（足す・けす・゛゜・後ろの ことば）。決まりごとは nameEdit.ts
  char(ch: string): boolean {
    return this.names.char(ch);
  }
  erase(): boolean {
    return this.names.erase();
  }
  mark(kind: 'dakuten' | 'handakuten'): boolean {
    return this.names.mark(kind);
  }
  suffix(back: string): boolean {
    return this.names.suffix(back);
  }

  /** あたらしい せっけいず →［ぜんぶ けす］: まっさらに（大きさ 5×5・窓 0・家具 なし・名前 空・① そと）。1 回の 操作 */
  resetAll(): boolean {
    const next = emptyState();
    this.sel = { palette: null, placed: null };
    this.resets++;
    const ok = this.commit(next, 'soto');
    this.s.step = 'soto';
    this.emit();
    return ok;
  }

  // ------------------------------------------------------------ もどす／すすむ

  undo(): boolean {
    const h = this.undos.pop();
    if (!h) return false;
    this.redos.push(h);
    this.restore(h.before, h.step);
    return true;
  }

  redo(): boolean {
    const h = this.redos.pop();
    if (!h) return false;
    this.undos.push(h);
    this.restore(h.after, h.step);
    return true;
  }

  private restore(state: EditorState, step: Step): void {
    this.s = cloneState(state);
    this.s.step = step === 'namae' && this.redItems().length > 0 ? 'naka' : step; // ③ に 赤い 家具は ない
    this.sel.placed = null;
    this.emit();
  }

  // ------------------------------------------------------------ 操作では ない もの

  /** つぎへ。② で 赤い 家具が ある 間は すすまない（ふきだし・赤い 家具が 1 回 光る。① の つぎへは 赤くても すすむ。1E） */
  next(): boolean {
    if (this.s.step === 'namae') return false;
    if (this.s.step === 'naka') {
      const red = this.redItems();
      if (red.length > 0) {
        this.stopRed(red);
        return false;
      }
    }
    this.s.step = this.s.step === 'soto' ? 'naka' : 'namae';
    this.sel.placed = null;
    this.emit();
    return true;
  }

  prev(): boolean {
    if (this.s.step === 'soto') return false;
    this.s.step = this.s.step === 'namae' ? 'naka' : 'soto';
    this.sel.placed = null;
    this.emit();
    return true;
  }

  selectPalette(kind: FurnKind | null): void {
    this.sel = { palette: kind, placed: null };
    this.emit();
  }
  selectPlaced(idx: number | null): void {
    this.sel = { palette: null, placed: idx };
    this.emit();
  }

  /** 家具の そばに 出る ボタン［とる］: えらんだ 家具を とる */
  takeSelected(): boolean {
    return this.sel.placed !== null && this.remove(this.sel.placed);
  }

  /** 家具の そばに 出る ボタン［↻］［↺］: えらんだ 家具を まわす */
  turnSelected(dir: 'right' | 'left'): boolean {
    return this.sel.placed !== null && this.rotate(this.sel.placed, dir);
  }

  /** えらんだ 家具の えらびを やめる（そばの ボタンが きえる）。えらんで いなければ false */
  clearPlaced(): boolean {
    if (this.sel.placed === null) return false;
    this.sel = { ...this.sel, placed: null };
    this.emit();
    return true;
  }

  setKatakana(on: boolean): void {
    this.katakana = on;
    this.emit();
  }

  openNeed(): void {
    this.needOpen = true;
    this.bubble = null;
    this.emit();
  }
  closeNeed(): void {
    this.needOpen = false;
    this.emit();
  }

  openReset(): void {
    this.confirm = 'reset';
    this.emit();
  }

  /** できた！: 下の 順に しらべ、ひっかかった 1 つ目で 止まる（§2.5。① は 2.2 で なくした）。止まった ときは かみ・ふで・持ち物は かわらない */
  done(): 'made' | 'stopped' | 'confirm' {
    const s = this.s;
    const stop = (text: string, step: Step | null): 'stopped' => {
      if (step) s.step = step;
      this.say(text);
      return 'stopped';
    };
    const red = this.redItems(); // ⓪ 赤い 家具（いちばん 先。② なか へ 切りかえて 光る のを 見せる）
    if (red.length > 0) {
      s.step = 'naka';
      this.stopRed(red);
      return 'stopped';
    }
    if (!s.furniture.some((p) => p.kind === K_FUTON)) return stop(MSG.futon, 'naka'); // ②
    if ([...s.name.front].length === 0) return stop(MSG.name, 'namae'); // ③
    if (hasNgName(s.name)) return stop(MSG.ngWord, 'namae'); // ③ よくない ことば（読みこんだ 作りかけ など）
    const bad = this.h.sheet.problem();
    if (bad) return stop(MSG[bad], null); // ④ かみ ⑤ ふで ⑥ もちものが いっぱい（MSG の 同じ名前の 文）
    if (s.furniture.every((p) => p.kind === K_FUTON)) {
      this.confirm = 'futonOnly'; // ⑦
      this.emit();
      return 'confirm';
    }
    this.finish();
    return 'made';
  }

  private finish(): void {
    this.h.sheet.make(this.s);
    this.bubble = null;
    this.emit();
    this.h.onMade();
  }

  /** 確かめの まど:［ぜんぶ けす］［このまま つくる］ */
  confirmYes(): void {
    const c = this.confirm;
    this.confirm = null;
    if (c === 'reset') this.resetAll();
    else if (c === 'futonOnly') this.finish();
    this.emit();
  }

  /** 確かめの まど:［やめる］［かぐを おく］（［かぐを おく］は ② なか へ） */
  confirmNo(): void {
    const c = this.confirm;
    this.confirm = null;
    if (c === 'futonOnly') this.s.step = 'naka';
    this.emit();
  }

  /** Esc: 確かめの まど → ひつような もの → 家具の えらび →（何も なければ false ＝ エディターを とじる）。AC55 */
  escape(): boolean {
    if (this.confirm) {
      this.confirm = null; // ふとん だけ ではせっけいずを 作らず、すすみも かわらない
      this.emit();
      return true;
    }
    if (this.needOpen) {
      this.closeNeed();
      return true;
    }
    return this.clearPlaced();
  }

  // ------------------------------------------------------------ 方眼

  /** (x, z) に ある 家具の 番号（重なって いれば あとから 置いた 方。なければ -1。1E） */
  indexAt(x: number, z: number): number {
    const f = this.s.furniture;
    for (let i = f.length - 1; i >= 0; i--) {
      const p = f[i]!;
      const [fw, fd] = footprint(p.kind, p.rot);
      if (x >= p.x && x < p.x + fw && z >= p.z && z < p.z + fd) return i;
    }
    return -1;
  }

  /** 方眼の マスを 押した: 置いた 家具が あれば（重なって いれば あとから 置いた 方を）えらぶ。えらんだ 種類が あれば 押した マスを もとの マスに して 置く。空いた マスで えらびを はずす */
  clickCell(x: number, z: number): boolean {
    const at = this.indexAt(x, z);
    if (at >= 0) {
      this.selectPlaced(at);
      return true;
    }
    const pend = this.pending();
    if (!pend) {
      this.selectPlaced(null);
      return false;
    }
    return this.place(pend.kind, x, z, pend.rot);
  }
}
