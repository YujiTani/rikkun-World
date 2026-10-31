// HOUSE-1B せっけいずの 形（EditorState）と 計算（窓の ならべ方・置ける 所・材料・名前）。DOM・three なし。
// 仕様 docs/design/HOUSE-1.md §4.1（大きさ・材料）・§4.2（窓と 戸）・§4.3（家具）・§2.6（名前）。
import type { ItemId } from '../../contracts';
import { furnFootprint } from '../../world/blocks/houseBlocks';
import { FURNITURE, isFurnKind, type FurnKind } from './furniture';
import {
  DOOR_WALL, MATERIAL_ORDER, NAME_FRONT_MAX, OPPOSITE, PAPER_PER_WINDOW, ROOF_DEFAULT, ROOF_KINDS, SIZES, SIZE_DEFAULT, STEPS, SUFFIXES, SUFFIX_DEFAULT,
  WINDOW_KINDS, WINDOW_KIND_DEFAULT, type RoofKind, type Rot, type Size, type Step, type Wall, type WindowKind,
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
function wallLength(w: number, d: number, wall: Wall): number {
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

/** 窓が かわった ようす（見本の 光る 窓。ふえた 窓 ＝ added、なくなった 窓の あと ＝ removed）。かべの 番号は windowCells と 同じ */
export interface OpeningChange {
  added: WindowCell[];
  removed: WindowCell[];
}

type OpeningKey = Pick<EditorState, 'w' | 'd' | 'windows' | 'windowKind'>;

const sameCell = (a: WindowCell, b: WindowCell): boolean => a.wall === b.wall && a.i === b.i;

/**
 * 窓の かず・しゅるいが かわって 見本が 光る とき。a → b。大きさ（よこ・たて）が かわった ときは null（家 ぜんたいが かわる ので 光らせない。
 * 窓が 上限で 切られた ときも 同じ）。しゅるいが かわった ときは 窓 ぜんぶが ふえた 窓。かわらなければ null
 */
export function openingChange(a: OpeningKey, b: OpeningKey): OpeningChange | null {
  if (a.w !== b.w || a.d !== b.d) return null;
  const was = windowCells(a);
  const now = windowCells(b);
  const kindChanged = a.windowKind !== b.windowKind;
  const added = kindChanged ? now : now.filter((c) => !was.some((q) => sameCell(q, c)));
  const removed = kindChanged ? [] : was.filter((c) => !now.some((q) => sameCell(q, c)));
  return added.length + removed.length > 0 ? { added, removed } : null;
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

// ------------------------------------------------------------ 家具を 置く（§2.5・§4.3）

export function footprint(kind: FurnKind, rot: Rot): readonly [number, number] {
  const [fw, fd] = FURNITURE[kind].cells;
  return furnFootprint(fw, fd, rot);
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
  item: ItemId;
  need: number;
  have: number;
  short: number;
}

/** 必要な 材料 ＝ 外装（き ＝ 外まわり 1 周、いし ＝ 中の 床）＋ 窓 × かみ 1 ＋ 家具の 合計。あかり（ちょうちん）は 材料 なし */
function materialsOf(s: Pick<EditorState, 'w' | 'd' | 'windows' | 'furniture'>): Map<ItemId, number> {
  const m = new Map<ItemId, number>();
  m.set('log', 2 * (s.w + s.d) + 4);
  m.set('stone', s.w * s.d);
  if (s.windows > 0) m.set('paper', (m.get('paper') ?? 0) + s.windows * PAPER_PER_WINDOW);
  for (const p of s.furniture) for (const [item, n] of FURNITURE[p.kind].mats) m.set(item, (m.get(item) ?? 0) + n);
  return m;
}

/** ひつような もの（§3.2 の 並び）。have ＝ くらの 数（item → 数） */
export function needOf(s: Pick<EditorState, 'w' | 'd' | 'windows' | 'furniture'>, have: (item: ItemId) => number): NeedRow[] {
  const m = materialsOf(s);
  return MATERIAL_ORDER.filter((item) => (m.get(item) ?? 0) > 0).map((item) => {
    const need = m.get(item) ?? 0;
    const got = have(item);
    return { item, need, have: got, short: Math.max(0, need - got) };
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
const KANA_ROWS: readonly string[] = [
  'あかさたなはまやらわ',
  'いきしちにひみ　り　',
  'うくすつぬふむゆるを',
  'えけせてねへめ　れ　',
  'おこそとのほもよろん',
];
const KANA_EXTRA: readonly string[] = ['゛', '゜', 'っ', 'ゃ', 'ゅ', 'ょ'];

/** 50 音の ボタンの 並び（6 行 × 11 列。空きは ''）。5 行目まで = 50 音表 ＋ 右はしの ゛ ゜ っ ゃ ゅ、6 行目 = ー の 列と ょ */
export const KANA_LAYOUT: readonly (readonly string[])[] = Array.from({ length: 6 }, (_, r) => [
  ...Array.from({ length: 10 }, (_, c) => (r < 5 ? [...KANA_ROWS[r]!][c]!.trim() : c === 0 ? 'ー' : '')),
  r < 5 ? KANA_EXTRA[r]! : KANA_EXTRA[5]!,
]);
/** 字の ボタン（゛ ゜ を のぞく）。ボタンの id は `char-<ひらがな>`（カタカナに しても id は ひらがなの まま） */
export const KANA_CHARS: readonly string[] = KANA_LAYOUT.flat().filter((c) => c !== '' && c !== '゛' && c !== '゜');

export function toKatakana(ch: string): string {
  const c = ch.charCodeAt(0);
  return c >= 0x3041 && c <= 0x3096 ? String.fromCharCode(c + 0x60) : ch;
}

/** 名前に 入れられる 字か（`KANA_CHARS` の ひらがな、または その カタカナ。表は `KANA_CHARS` の 1 か所） */
const KANA_INPUT: ReadonlySet<string> = new Set([...KANA_CHARS, ...KANA_CHARS.map(toKatakana)]);
export function isKanaChar(ch: string): boolean {
  return KANA_INPUT.has(ch);
}

export function canAddChar(front: string): boolean {
  return [...front].length < NAME_FRONT_MAX;
}

// ------------------------------------------------------------ 保存から 読む（形が おかしい 所は はじめの まま）

const NAME_CHAR = /^[\u3041-\u3096\u30A1-\u30FA\u30FC\u309B\u309C]$/;
const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** 保存された 作りかけ → EditorState。知らない 値・おかしい 値・置けない 家具は すてる（例外を 出さない） */
export function parseState(raw: unknown): EditorState {
  const out = emptyState();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  out.step = STEPS.find((x) => x === r.step) ?? out.step;
  out.w = SIZES.find((x) => x === r.w) ?? out.w;
  out.d = SIZES.find((x) => x === r.d) ?? out.d;
  out.windowKind = WINDOW_KINDS.find((x) => x === r.windowKind) ?? out.windowKind;
  out.roof = ROOF_KINDS.find((x) => x === r.roof) ?? out.roof;
  if (int(r.windows)) out.windows = Math.min(Math.max(r.windows, 0), windowMax(out));
  const nm = r.name as { front?: unknown; back?: unknown } | null | undefined;
  if (typeof nm === 'object' && nm !== null) {
    if (typeof nm.front === 'string') out.name.front = [...nm.front].filter((c) => NAME_CHAR.test(c)).slice(0, NAME_FRONT_MAX).join('');
    out.name.back = SUFFIXES.find((x) => x === nm.back) ?? out.name.back;
  }
  if (Array.isArray(r.furniture)) {
    for (const f of r.furniture as unknown[]) {
      const q = f as Record<string, unknown> | null;
      if (typeof q !== 'object' || q === null || !isFurnKind(q.kind) || !int(q.x) || !int(q.z)) continue;
      const rot = q.rot === 0 || q.rot === 1 || q.rot === 2 || q.rot === 3 ? q.rot : null;
      if (rot === null) continue;
      const p: Placed = { kind: q.kind, x: q.x, z: q.z, rot };
      if (placeProblem(out, p) === null) out.furniture.push(p);
    }
  }
  return out;
}
