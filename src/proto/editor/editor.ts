// HOUSE-1B 試作: エディターの 持ち主（状態・もどす／すすむ・できた！の しらべ・ふきだし）。DOM なし。
// 仕様 docs/design/HOUSE-1.md §2.5（すすみ方・できた！・もどす／すすむ・Esc の 順）。
// 試作の ため: 保存・せっけいず・かみ・ふで・持ち物は 作らない（できた！の しらべ ④〜⑥ は 通る ことに する）。
import {
  cloneState, dakuten, emptyState, handakuten, canAddChar, needOf, placeProblem, refit, windowMax, footprint,
  type EditorState, type NeedRow, type Placed,
} from './model';
import { SIZES, SUFFIXES, FURNITURE, K_FUTON, ROOF_KINDS, WINDOW_KINDS, type FurnKind, type RoofKind, type Rot, type Size, type Step, type WindowKind } from './tuning';

export type Confirm = null | 'reset' | 'futonOnly';

/** 家具の えらび: palette ＝ 一覧から えらんだ 種類（置く 前）、placed ＝ 置いた 家具の 番号、light ＝ あかり */
export interface Selection {
  palette: FurnKind | null;
  placed: number | null;
  light: boolean;
}

interface HistoryItem {
  before: EditorState;
  after: EditorState;
  /** この 操作が 属する すすみ（もどすと この すすみへ 切りかわる） */
  step: Step;
}

export const MSG = {
  futon: 'ふとんが ないと ねられないよ',
  name: 'なまえを つけてね',
  paper: 'かみが ないと かけないよ。かみは からかさや ちょうちんの ようかいが おとすよ',
  fude: 'ふでが ないと かけないよ。ふでは すみ と たけ で つくれるよ',
  full: 'もちものが いっぱい だよ',
  light: 'あかりは ひとつ ひつようだよ',
  tidy: 'はいらない かぐを かたづけたよ',
  made: 'せっけいずが できたよ！',
  futonOnly: ['ふとん だけ で いい？', 'ほかの かぐも おけるよ'],
  reset: ['いまの かたちを', 'ぜんぶ けす？'],
} as const;

export class EditorController {
  s: EditorState = emptyState();
  sel: Selection = { palette: null, placed: null, light: true };
  /** 「あたらしい せっけいず → ぜんぶ けす」を した 回数（見本の 向きを はじめに もどす ため） */
  resets = 0;
  katakana = false;
  confirm: Confirm = null;
  needOpen = false;
  bubble: { text: string; seq: number } | null = null;
  /** 赤く 1 回 光らせる 家具の 番号（まわせなかった とき）と 通し番号 */
  flash: { idx: number; seq: number } | null = null;
  private undos: HistoryItem[] = [];
  private redos: HistoryItem[] = [];
  private seq = 0;
  private readonly listeners: Array<() => void> = [];

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
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
    return needOf(this.s);
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

  // ------------------------------------------------------------ ふきだし

  say(text: string): void {
    this.bubble = { text, seq: ++this.seq };
    this.emit();
  }
  hideBubble(): void {
    if (!this.bubble) return;
    this.bubble = null;
    this.emit();
  }

  // ------------------------------------------------------------ 操作（もどす の 1 回に なる もの）

  /** 状態を かえて 履歴に 積む。かわらなければ 何もしない（false） */
  private commit(next: EditorState, step: Step): boolean {
    if (JSON.stringify(next) === JSON.stringify(this.s)) return false;
    this.undos.push({ before: cloneState(this.s), after: cloneState(next), step });
    this.redos = [];
    const keep = this.s.step;
    this.s = next;
    this.s.step = keep;
    this.fixSelection();
    this.emit();
    return true;
  }

  private fixSelection(): void {
    if (this.sel.placed !== null && this.sel.placed >= this.s.furniture.length) this.sel.placed = null;
  }

  setSize(patch: { w?: Size; d?: Size }): boolean {
    if ((patch.w !== undefined && !SIZES.includes(patch.w)) || (patch.d !== undefined && !SIZES.includes(patch.d))) return false;
    const next = cloneState(this.s);
    if (patch.w !== undefined) next.w = patch.w;
    if (patch.d !== undefined) next.d = patch.d;
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

  /** 窓の しゅるい・屋根の しゅるい（ボタンの ならびに ある 物だけ） */
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

  /** あかりを 押す・とる: ちょうちんは はずせない（何も かわらない・もどす にも 入らない） */
  lightTouched(): void {
    this.say(MSG.light);
  }

  char(ch: string): boolean {
    if (!canAddChar(this.s.name.front)) return false;
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

  /** あたらしい せっけいず →［ぜんぶ けす］: まっさらに（大きさ 未選択・窓 0・戸 まえ・家具 なし・名前 空・① そと） */
  resetAll(): boolean {
    const next = emptyState();
    this.sel = { palette: null, placed: null, light: true };
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
    this.s = cloneState(h.before);
    this.s.step = h.step;
    this.sel.placed = null;
    this.emit();
    return true;
  }

  redo(): boolean {
    const h = this.redos.pop();
    if (!h) return false;
    this.undos.push(h);
    this.s = cloneState(h.after);
    this.s.step = h.step;
    this.sel.placed = null;
    this.emit();
    return true;
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
    this.sel = { ...this.sel, palette: kind, placed: null, light: false };
    this.emit();
  }
  selectPlaced(idx: number | null): void {
    this.sel = { ...this.sel, palette: null, placed: idx, light: false };
    this.emit();
  }
  selectLight(): void {
    this.sel = { ...this.sel, palette: null, placed: null, light: true };
    this.lightTouched();
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

  /** できた！: 下の 順に しらべ、ひっかかった 1 つ目で 止まる（試作: ④〜⑥ の かみ・ふで・持ち物は 通る ことに する） */
  done(): 'made' | 'stopped' | 'confirm' {
    const s = this.s;
    const stop = (text: string, step: Step): 'stopped' => {
      s.step = step;
      this.say(text);
      return 'stopped';
    };
    if (!s.furniture.some((p) => p.kind === K_FUTON)) return stop(MSG.futon, 'naka');
    if ([...s.name.front].length === 0) return stop(MSG.name, 'namae');
    if (s.furniture.every((p) => p.kind === K_FUTON)) {
      this.confirm = 'futonOnly';
      this.emit();
      return 'confirm';
    }
    this.say(MSG.made);
    return 'made';
  }

  /** 確かめの まど:［ぜんぶ けす］［このまま つくる］ */
  confirmYes(): void {
    const c = this.confirm;
    this.confirm = null;
    if (c === 'reset') this.resetAll();
    else if (c === 'futonOnly') this.say(MSG.made);
    this.emit();
  }

  /** 確かめの まど:［やめる］［かぐを おく］（［かぐを おく］は ② なか へ） */
  confirmNo(): void {
    const c = this.confirm;
    this.confirm = null;
    if (c === 'futonOnly') this.s.step = 'naka';
    this.emit();
  }

  /** Esc: 確かめの まど → ひつような もの → 家具の えらび → （何も なければ false ＝ エディターを とじる） */
  escape(): boolean {
    if (this.confirm) {
      this.confirmNo();
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

  /** 方眼の マスを 押した: 置いた 家具が あれば えらぶ。えらんだ 種類が あれば 置く */
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

  kindName(kind: FurnKind): string {
    return FURNITURE[kind].name;
  }
}
