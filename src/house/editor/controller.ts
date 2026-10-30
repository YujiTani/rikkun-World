// HOUSE-1B エディターの 持ち主（作りかけ・もどす／すすむ・できた！の しらべ・ふきだし）。DOM・three なし。
// 仕様 docs/design/HOUSE-1.md §2.5（すすみ方・できた！・もどす／すすむ・Esc の 順）・§2.6（名前）・§4.9（ふきだしの 長さ）。
import type { ItemId } from '../../contracts';
import { K_FUTON, FURNITURE, type FurnKind } from './furniture';
import {
  canAddChar, cloneState, dakuten, emptyState, footprint, handakuten, needOf, placeProblem, refit, windowMax,
  type EditorState, type NeedRow, type Placed,
} from './model';
import {
  BUBBLE, MSG, ROOF_KINDS, SIZES, SUFFIXES, WINDOW_KINDS,
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
  /** 赤く 1 回 光らせる 家具の 番号（まわせなかった とき）と 通し番号 */
  flash: { idx: number; seq: number } | null = null;
  /** 中身が かわった たびに ふえる 数（画面の 描きなおしの 目印） */
  version = 0;
  private undos: HistoryItem[] = [];
  private redos: HistoryItem[] = [];
  private seq = 0;
  private readonly listeners: Array<() => void> = [];

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

  /** エディターを 開く: 見本の 向きや 家具の えらびは 作りかけに 入らないので、えらびと ポップアップを まっさらに（もどす の 記録は のこす） */
  open(): void {
    this.sel = { palette: null, placed: null };
    this.confirm = null;
    this.needOpen = false;
    this.bubble = null;
    this.katakana = false;
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

  place(kind: FurnKind, x: number, z: number, rot: Rot = 0): boolean {
    if (!(kind in FURNITURE)) return false;
    const p: Placed = { kind, x, z, rot };
    if (placeProblem(this.s, p) !== null) return false;
    const next = cloneState(this.s);
    next.furniture.push(p);
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

  /** 置いた 家具を まわす。はみ出す・重なる ときは まわらない（赤く 1 回 光る） */
  rotate(idx: number, dir: 'right' | 'left'): boolean {
    const p = this.s.furniture[idx];
    if (!p) return false;
    const rot = ((p.rot + (dir === 'right' ? 1 : 3)) % 4) as Rot;
    const turned: Placed = { ...p, rot };
    if (placeProblem(this.s, turned, idx) !== null) {
      this.flash = { idx, seq: ++this.seq };
      this.emit();
      return false;
    }
    const next = cloneState(this.s);
    next.furniture[idx] = turned;
    return this.commit(next, 'naka');
  }

  /** あかりを 押す: ちょうちんは はずせない（何も かわらない・もどす にも 入らない） */
  lightTouched(): void {
    this.say(MSG.light);
  }

  char(ch: string): boolean {
    if ([...ch].length !== 1 || !canAddChar(this.s.name.front)) return false;
    const next = cloneState(this.s);
    next.name.front += ch;
    return this.commit(next, 'namae');
  }

  erase(): boolean {
    const chars = [...this.s.name.front];
    if (chars.length === 0) return false;
    chars.pop();
    const next = cloneState(this.s);
    next.name.front = chars.join('');
    return this.commit(next, 'namae');
  }

  mark(kind: 'dakuten' | 'handakuten'): boolean {
    const chars = [...this.s.name.front];
    const last = chars.pop();
    if (!last) return false;
    const marked = kind === 'dakuten' ? dakuten(last) : handakuten(last);
    if (marked === null) return false;
    const next = cloneState(this.s);
    next.name.front = [...chars, marked].join('');
    return this.commit(next, 'namae');
  }

  suffix(back: string): boolean {
    if (!SUFFIXES.includes(back)) return false;
    const next = cloneState(this.s);
    next.name.back = back;
    return this.commit(next, 'namae');
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
    this.s.step = step;
    this.sel.placed = null;
    this.emit();
  }

  // ------------------------------------------------------------ 操作では ない もの

  next(): boolean {
    if (this.s.step === 'namae') return false;
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
    if (!s.furniture.some((p) => p.kind === K_FUTON)) return stop(MSG.futon, 'naka'); // ②
    if ([...s.name.front].length === 0) return stop(MSG.name, 'namae'); // ③
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

  /** (x, z) に ある 家具の 番号（なければ -1） */
  indexAt(x: number, z: number): number {
    return this.s.furniture.findIndex((p) => {
      const [fw, fd] = footprint(p.kind, p.rot);
      return x >= p.x && x < p.x + fw && z >= p.z && z < p.z + fd;
    });
  }

  /** 方眼の マスを 押した: 置いた 家具が あれば えらぶ。えらんだ 種類が あれば 置く。空いた マスで えらびを はずす */
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
