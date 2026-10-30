// HOUSE-1B 試作: せっけいずの 形（EditorState）と 計算（窓の ならべ方・置ける 所・材料・名前）。DOM・three なし。
// 仕様 docs/design/HOUSE-1.md §4.1（大きさ・材料）・§4.2（窓と 戸）・§4.3（家具）・§2.6（名前）。
import {
  DOOR_WALL, FURNITURE, KURA_DEMO, MATERIAL_ORDER, NAME_FRONT_MAX, OPPOSITE, PAPER_PER_WINDOW, ROOF_DEFAULT, SIZE_DEFAULT, SUFFIX_DEFAULT, WINDOW_KIND_DEFAULT,
  type FurnKind, type RoofKind, type Rot, type Size, type Step, type Wall, type WindowKind,
} from './tuning';

export interface Placed {
  kind: FurnKind;
  /** 左上の マス（うしろ・ひだりの すみから 0） */
  x: number;
  z: number;
  /** みぎに まわす たびに ＋1（ふとんの 0 ＝ まくらが うしろ） */
  rot: Rot;
}

export interface EditorState {
  step: Step;
  /** よこ（まえ・うしろの かべの 中の 長さ）・たて（ひだり・みぎ）。はじめから 5 と 5（未選択は ない）。戸は まえ 固定（DOOR_WALL） */
  w: Size;
  d: Size;
  windows: number;
  /** 窓・屋根の しゅるい（いまは 1 つずつ。あとで レシピで ふえる） */
  windowKind: WindowKind;
  roof: RoofKind;
  furniture: Placed[];
  name: { front: string; back: string };
}

export function emptyState(): EditorState {
  return {
    step: 'soto', w: SIZE_DEFAULT, d: SIZE_DEFAULT, windows: 0, windowKind: WINDOW_KIND_DEFAULT, roof: ROOF_DEFAULT,
    furniture: [], name: { front: '', back: SUFFIX_DEFAULT },
  };
}

export function cloneState(s: EditorState): EditorState {
  return { ...s, furniture: s.furniture.map((p) => ({ ...p })), name: { ...s.name } };
}

// ------------------------------------------------------------ 窓と 戸（§4.2）

/** かべ 1 まいの 中の 長さ（よこ ＝ まえ・うしろ、たて ＝ ひだり・みぎ） */
export function wallLength(w: number, d: number, wall: Wall): number {
  return wall === 'front' || wall === 'back' ? w : d;
}

/** むかいの 壁に 入る 数 A・よこの 壁 1 つに 入る 数 S・窓の 上限 A＋2S（戸は まえ 固定 ＝ むかいは うしろ、よこは ひだり・みぎ） */
function windowLimits(w: number, d: number): { A: number; S: number; max: number; side: readonly [Wall, Wall] } {
  const side: readonly [Wall, Wall] = ['left', 'right'];
  const A = (wallLength(w, d, OPPOSITE[DOOR_WALL]) + 1) / 2;
  const S = (wallLength(w, d, side[0]) + 1) / 2;
  return { A, S, max: A + 2 * S, side };
}

/** n この 窓を むかい a・よこ s ずつ に 分ける（式: s ＝ min(S, max(⌊(n＋1)÷3⌋, ⌈(n − A)÷2⌉))、a ＝ n − 2s） */
function windowSplit(w: number, d: number, n: number): { a: number; s: number } {
  const { A, S } = windowLimits(w, d);
  const s = Math.min(S, Math.max(Math.floor((n + 1) / 3), Math.ceil((n - A) / 2)));
  return { a: n - 2 * s, s };
}

/** 長さ L の かべに k こ: まん中を はさんで 左右 対称に 2 マスおき */
function wallSlots(L: number, k: number): number[] {
  const c = (L - 1) / 2;
  return Array.from({ length: k }, (_, i) => c - (k - 1) + 2 * i);
}

export interface WindowCell {
  wall: Wall;
  i: number;
}

export function windowCells(s: Pick<EditorState, 'w' | 'd' | 'windows'>): WindowCell[] {
  if (s.windows <= 0) return [];
  const { side } = windowLimits(s.w, s.d);
  const { a, s: each } = windowSplit(s.w, s.d, s.windows);
  const out: WindowCell[] = [];
  const add = (wall: Wall, k: number): void => {
    for (const i of wallSlots(wallLength(s.w, s.d, wall), k)) out.push({ wall, i });
  };
  add(OPPOSITE[DOOR_WALL], a);
  add(side[0], each);
  add(side[1], each);
  return out;
}

export function windowMax(s: Pick<EditorState, 'w' | 'd'>): number {
  return windowLimits(s.w, s.d).max;
}

/** 戸の かべの 中での 場所（まん中。窓と おなじ 数え方） */
export function doorIndex(s: Pick<EditorState, 'w' | 'd'>): number {
  return (wallLength(s.w, s.d, DOOR_WALL) - 1) / 2;
}

/** 戸の 前の 中がわの 1 マス（家具は 置けない。戸は まえ 固定 ＝ まえの かべの まん中の 内がわ） */
export function doorInside(s: Pick<EditorState, 'w' | 'd'>): { x: number; z: number } {
  return { x: (s.w - 1) / 2, z: s.d - 1 };
}

/** 窓が かわった ときの、見せる 窓（ふえた・へった・しゅるいが かわった）。大きさが かわった とき・かわって いない ときは null */
export interface OpeningChange {
  added: WindowCell[];
  removed: WindowCell[];
}
type OpeningKey = Pick<EditorState, 'w' | 'd' | 'windows' | 'windowKind'>;
export function openingChange(a: OpeningKey, b: OpeningKey): OpeningChange | null {
  if (a.w !== b.w || a.d !== b.d) return null;
  const was = windowCells(a);
  const now = windowCells(b);
  const has = (list: WindowCell[], c: WindowCell): boolean => list.some((q) => q.wall === c.wall && q.i === c.i);
  const kindChanged = a.windowKind !== b.windowKind;
  const added = kindChanged ? now : now.filter((c) => !has(was, c));
  const removed = kindChanged ? [] : was.filter((c) => !has(now, c));
  return added.length + removed.length > 0 ? { added, removed } : null;
}

// ------------------------------------------------------------ 家具を 置く（§2.5・§4.3）

export function footprint(kind: FurnKind, rot: Rot): readonly [number, number] {
  const [fw, fd] = FURNITURE[kind].cells;
  return rot % 2 === 0 ? [fw, fd] : [fd, fw];
}

export type PlaceProblem = 'out' | 'door' | 'overlap';

/** 置けない わけ（置ける なら null）。skip ＝ いま 動かして いる 家具の 番号（自分とは 重ならない） */
export function placeProblem(s: EditorState, p: Placed, skip = -1): PlaceProblem | null {
  const [fw, fd] = footprint(p.kind, p.rot);
  if (p.x < 0 || p.z < 0 || p.x + fw > s.w || p.z + fd > s.d) return 'out';
  const door = doorInside(s);
  if (door.x >= p.x && door.x < p.x + fw && door.z >= p.z && door.z < p.z + fd) return 'door';
  for (let i = 0; i < s.furniture.length; i++) {
    if (i === skip) continue;
    const q = s.furniture[i]!;
    const [qw, qd] = footprint(q.kind, q.rot);
    if (p.x < q.x + qw && q.x < p.x + fw && p.z < q.z + qd && q.z < p.z + fd) return 'overlap';
  }
  return null;
}

/** 大きさを かえた あと: 家具を 家の まん中からの 位置の まま 動かし、入らない 物を 消す。消えた 数も 返す */
export function refit(old: EditorState, next: EditorState): { state: EditorState; dropped: number } {
  const out = cloneState(next);
  out.windows = Math.min(out.windows, windowMax(out));
  const dx = (out.w - old.w) / 2;
  const dz = (out.d - old.d) / 2;
  const kept: Placed[] = [];
  let dropped = 0;
  for (const p of old.furniture) {
    const moved: Placed = { ...p, x: p.x + dx, z: p.z + dz };
    if (placeProblem({ ...out, furniture: kept }, moved) === null) kept.push(moved);
    else dropped++;
  }
  out.furniture = kept;
  return { state: out, dropped };
}

// ------------------------------------------------------------ 材料（§4.1・§4.3）

export interface NeedRow {
  item: string;
  need: number;
  have: number;
  short: number;
}

/** 必要な 材料 ＝ 外装（き ＝ 外まわり 1 周、いし ＝ 中の 床）＋ 窓 × かみ 1 ＋ 家具の 合計。あかり（ちょうちん）は 材料 なし */
function materialsOf(s: Pick<EditorState, 'w' | 'd' | 'windows' | 'furniture'>): Map<string, number> {
  const m = new Map<string, number>();
  m.set('log', 2 * (s.w + s.d) + 4);
  m.set('stone', s.w * s.d);
  if (s.windows > 0) m.set('paper', (m.get('paper') ?? 0) + s.windows * PAPER_PER_WINDOW);
  for (const p of s.furniture) for (const [item, n] of FURNITURE[p.kind].mats) m.set(item, (m.get(item) ?? 0) + n);
  return m;
}

export function needOf(s: EditorState, kura: Readonly<Record<string, number>> = KURA_DEMO): NeedRow[] {
  const m = materialsOf(s);
  return MATERIAL_ORDER.filter((item) => (m.get(item) ?? 0) > 0).map((item) => {
    const need = m.get(item) ?? 0;
    const have = kura[item] ?? 0;
    return { item, need, have, short: Math.max(0, need - have) };
  });
}

// ------------------------------------------------------------ 名前（§2.6）

const HIRA_DAKU = 'かきくけこさしすせそたちつてとはひふへほ';
const HIRA_HANDAKU = 'はひふへほ';

/** ゛を つけた 字（つけられない ときは null）。ひらがな・カタカナ どちらも */
export function dakuten(ch: string): string | null {
  const i = HIRA_DAKU.indexOf(ch);
  if (i >= 0) return String.fromCharCode(ch.charCodeAt(0) + 1);
  if (ch === 'う') return 'ゔ';
  const hira = String.fromCharCode(ch.charCodeAt(0) - 0x60);
  if (HIRA_DAKU.includes(hira)) return String.fromCharCode(ch.charCodeAt(0) + 1);
  if (ch === 'ウ') return 'ヴ';
  return null;
}

/** ゜を つけた 字（は行 だけ） */
export function handakuten(ch: string): string | null {
  const hira = HIRA_HANDAKU.includes(ch) ? ch : String.fromCharCode(ch.charCodeAt(0) - 0x60);
  if (!HIRA_HANDAKU.includes(hira)) return null;
  return String.fromCharCode(ch.charCodeAt(0) + 2);
}

/** ひらがなの 50 音表（よこ 10 列 × たて 5 行。空白は 空き）と、ひらがな → カタカナ */
export const KANA_ROWS: readonly string[] = [
  'あかさたなはまやらわ',
  'いきしちにひみ　り　',
  'うくすつぬふむゆるを',
  'えけせてねへめ　れ　',
  'おこそとのほもよろん',
];
export const KANA_EXTRA: readonly string[] = ['゛', '゜', 'っ', 'ゃ', 'ゅ', 'ょ'];

export function toKatakana(ch: string): string {
  const c = ch.charCodeAt(0);
  return c >= 0x3041 && c <= 0x3096 ? String.fromCharCode(c + 0x60) : ch;
}

export function canAddChar(front: string): boolean {
  return [...front].length < NAME_FRONT_MAX;
}
