// HOUSE-2A（#364）見本の こたえ: しゅるいを かえた・かざりを つけた ときに どこが 光るか・どちらへ 回るか。仕様 docs/design/HOUSE-2.md §2.3・AC8。three なし。
//   まど・はなだん → うしろの かど（135／225）へ 回って 光る、と・のれん → まえ ＋28° へ 回って 光る、やね・かべ・えんとつ・しゃちほこ → 回らず 光る。
//   同じ 形の 案の 入れかえでも 光る。かざりを はずす・「なし」を えらぶ ときは 光らない（まど なしは 回る だけ）。
import { splitKind } from '../recipes/kinds';
import type { EditorState } from '../editor/model';

/** 前と くらべる 形（見本が 前に 見た もの） */
export type ShapeSnap = Pick<EditorState, 'w' | 'd' | 'windows' | 'windowKind' | 'roof' | 'wall' | 'door' | 'deco'>;

export const snapOf = (s: ShapeSnap): ShapeSnap => ({ w: s.w, d: s.d, windows: s.windows, windowKind: s.windowKind, roof: s.roof, wall: s.wall, door: s.door, deco: [...s.deco] });

export type Turn = 'back' | 'front' | null;
export interface PartChange {
  /** 光る 部分（なければ 空 ＝ 光らない） */
  parts: string[];
  turn: Turn;
}

/** かざりの 形 → 回る 向き（はなだん ＝ 窓の 下、のれん ＝ 戸の 上） */
const DECO_TURN: Readonly<Record<string, Turn>> = { hanadan: 'back', noren: 'front', entotsu: null, shachi: null };
/** かざりを くらべる 順（光る 名前の 順） */
const DECO_FORMS = ['hanadan', 'noren', 'entotsu', 'shachi'] as const;

const decoOf = (deco: readonly string[], form: string): string | null => deco.find((d) => splitKind(d).form === form) ?? null;

/**
 * 前と 今の くらべ。大きさ（よこ・たて）が かわって いる ときは 呼ばない（家 ぜんたいが かわる ので 光らせない）。
 * 何も かわらない ときは null。かわった けど 光らない（なし・はずす）とき も 回る 向きが あれば 返す
 */
export function partChange(was: ShapeSnap, now: ShapeSnap): PartChange | null {
  const parts: string[] = [];
  let turn: Turn = null;
  let changed = false;
  const hit = (part: string | null, t: Turn): void => {
    changed = true;
    if (part !== null) parts.push(part);
    turn ??= t;
  };
  if (was.windowKind !== now.windowKind) hit(now.windowKind === 'none' ? null : 'window', now.windows > 0 ? 'back' : null);
  for (const form of DECO_FORMS) {
    const a = decoOf(was.deco, form);
    const b = decoOf(now.deco, form);
    if (b !== null && a !== b) hit(form, form === 'hanadan' && now.windows === 0 ? null : (DECO_TURN[form] ?? null)); // つけた・案の 入れかえ（はずす だけは 光らない）
  }
  if (was.door !== now.door) hit('door', 'front');
  if (was.roof !== now.roof) hit(now.roof === 'none' ? null : 'roof', null);
  if (was.wall !== now.wall) hit(now.wall === 'none' ? null : 'wall', null);
  return changed ? { parts, turn } : null;
}
