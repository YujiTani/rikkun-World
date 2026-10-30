// HOUSE-1B せっけいずの 中身（持ち物の マスの `plan` 番号 → ここ）。DOM・three なし。仕様 docs/design/HOUSE-1.md §2.7・§6.1。
import { cloneState, parseState, windowCells, type EditorState, type Placed, type WindowCell } from './model';
import { LIGHT_DEFAULT, type LightKind, type RoofKind, type Size, type WindowKind } from './tuning';

/** せっけいず 1 まいの 中身。番号は その 世界で 作った 順（1, 2, 3 …。すてても こわしても もどらない） */
export interface Blueprint {
  number: number;
  name: { front: string; back: string };
  w: Size;
  d: Size;
  windows: number;
  windowKind: WindowKind;
  roof: RoofKind;
  furniture: Placed[];
  light: LightKind;
}

/** 作りかけ → せっけいず（コピー。あとで 作りかけを かえても せっけいずは かわらない） */
export function toBlueprint(draft: Readonly<EditorState>, number: number): Blueprint {
  const s = cloneState(draft as EditorState);
  return { number, name: s.name, w: s.w, d: s.d, windows: s.windows, windowKind: s.windowKind, roof: s.roof, furniture: s.furniture, light: LIGHT_DEFAULT };
}

/** せっけいずの 名前（持ち物の ツールチップ）。「<前><後ろ>の せっけいず」 */
export function blueprintName(bp: Pick<Blueprint, 'name'>): string {
  return `${bp.name.front}${bp.name.back}の せっけいず`;
}

/** 窓の 場所（見本・窓口） */
export function blueprintWindows(bp: Pick<Blueprint, 'w' | 'd' | 'windows'>): WindowCell[] {
  return windowCells(bp);
}

/** 保存から 読む。番号が 正の 整数で ない ものは null。形は 作りかけと 同じ 決まりで 読む（おかしい 所は はじめの まま） */
export function parseBlueprint(raw: unknown): Blueprint | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.number !== 'number' || !Number.isInteger(r.number) || r.number < 1) return null;
  return toBlueprint(parseState(r), r.number);
}
