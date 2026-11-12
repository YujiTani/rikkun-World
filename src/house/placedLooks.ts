// HOUSE-2C（#364・仕様 3.4 版 docs/design/HOUSE-2.md §2.7）手で 置いた 家の 物の 案の 記録（置いた ときの 記録）。世界に 1 つ。DOM・three なし。
// ブロックの 番号は 形ごと なので、手で 置いた ブロックが むら・おしろ・こうざんの どれかは ここに 書く。家の 記録（HouseBook）とは べつ。
import type { BlockId } from '../contracts';
import type { BlockWatcher } from './blockWatch';
import { PARTS, PART_FORMS, STYLES, isStyleless, kindBlocks, kindsOfForm, splitKind, type Style } from './recipes/kinds';
import { LOOK_DOOR_IDS } from '../world/blocks/houseLookBlocks';

/** 前が 向く 方位（n ＝ −z・s ＝ ＋z・e ＝ ＋x・w ＝ −x。家の 戸の かべが 南 ＝ ＋z と 同じ きめ） */
export type Facing = 'n' | 'e' | 's' | 'w';
const FACINGS: readonly Facing[] = ['n', 'e', 's', 'w'];

/** 置いた ときの 記録 1 件（x・y・z・案・向き・置いた ブロックの id） */
interface Rec {
  x: number;
  y: number;
  z: number;
  style: Style;
  facing: Facing;
  block: BlockId;
}
/** 外へ 見せる 答え（記録の 中身の うち 案と 向き） */
export interface PlacedLook {
  style: Style;
  facing: Facing;
}
/** 保存の 1 行（キー placedLooks の 中身） */
export type PlacedRow = [number, number, number, Style, Facing];

/** 案の ある 形の ブロック id（やね・かべ〔柱 のぞく〕・まど・と・えんとつ・のれん・はなだん。しゃちほこ・あかりは 案が ない） */
const STYLED_BLOCKS: ReadonlySet<string> = new Set(
  PARTS.flatMap((part) => PART_FORMS[part].filter((f) => !isStyleless(f)).flatMap((f) => kindBlocks(part, kindsOfForm(f)[0]!))),
);
/** 案の ある 形の ブロックか */
const isStyledBlock = (id: string): boolean => STYLED_BLOCKS.has(id);
/** ブロック id → その 形の しゅるい id（案 むら。しゅるいの 形を 引く 用） */
const FORM_OF_BLOCK: ReadonlyMap<string, { part: (typeof PARTS)[number]; form: string }> = new Map(
  PARTS.flatMap((part) => PART_FORMS[part].filter((f) => !isStyleless(f)).flatMap((f) => kindBlocks(part, kindsOfForm(f)[0]!).map((b) => [b, { part, form: f }] as const))),
);
/** ブロック id → その 形（ばしょ・形）。案の ある 形の ブロックで なければ null */
export const formOfBlock = (id: string): { part: (typeof PARTS)[number]; form: string } | null => FORM_OF_BLOCK.get(id) ?? null;
/** てつの と の 4 つ（あける・しめる ＝ この 4 つの あいだの かわり） */
const DOOR_IDS: ReadonlySet<string> = new Set<string>(LOOK_DOOR_IDS);

/** x・y・z → 数の 鍵（x・z は ±百万、y は 0〜255。外は null） */
function keyOf(x: number, y: number, z: number): number | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || y < 0 || y > 255 || Math.abs(x) > 1048575 || Math.abs(z) > 1048575) return null;
  return ((x + 1048576) * 2097152 + (z + 1048576)) * 256 + y;
}

/** 手で 置いた 物の 案の 記録。get は 記録の 数に よらない（Map の 1 回 引き） */
export class PlacedLooks implements BlockWatcher {
  private readonly recs = new Map<number, Rec>();
  /** get が 見た 記録の 数の 合計（見張り。1 回の get で 1 マス 分しか ふえない） */
  probes = 0;

  get size(): number {
    return this.recs.size;
  }

  set(x: number, y: number, z: number, style: Style, facing: Facing, block: BlockId): void {
    const k = keyOf(x, y, z);
    if (k !== null) this.recs.set(k, { x, y, z, style, facing, block });
  }

  get(x: number, y: number, z: number): PlacedLook | null {
    const k = keyOf(x, y, z);
    this.probes++;
    const r = k === null ? undefined : this.recs.get(k);
    return r ? { style: r.style, facing: r.facing } : null;
  }

  /** 建築士さんが その マスを 置きかえた（同じ id でも 消す） */
  erase(x: number, y: number, z: number): void {
    if (this.recs.size === 0) return;
    const k = keyOf(x, y, z);
    if (k !== null) this.recs.delete(k);
  }

  /** マスが かわった（watchBlocks の 知らせ）。てつの と の あけしめ だけは のこす */
  cellChanged(x: number, y: number, z: number, id: BlockId): void {
    if (this.recs.size === 0) return;
    const k = keyOf(x, y, z);
    const r = k === null ? undefined : this.recs.get(k);
    if (!r) return;
    if (DOOR_IDS.has(r.block) && DOOR_IDS.has(id)) r.block = id;
    else this.recs.delete(k!);
  }

  /** 箱の 中を ぜんぶ id に した（fill）。箱の 中の 記録を 同じ きまりで 消す */
  boxFilled(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): void {
    if (this.recs.size === 0) return;
    const [lx, hx, ly, hy, lz, hz] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1), Math.min(z0, z1), Math.max(z0, z1)];
    for (const r of [...this.recs.values()]) if (r.x >= lx && r.x <= hx && r.y >= ly && r.y <= hy && r.z >= lz && r.z <= hz) this.cellChanged(r.x, r.y, r.z, id);
  }

  /** 列の 変化は 見ない（cellChanged が 見る） */
  blockChanged(): void {}
  blocksChanged(): void {}

  save(): PlacedRow[] {
    return [...this.recs.values()].map((r) => [r.x, r.y, r.z, r.style, r.facing]);
  }

  /** 読む（前の 記録は すてる）。ブロックが 案の ある 形で ない 行・形の おかしい 行は すてる */
  restore(rows: unknown, blockAt: (x: number, y: number, z: number) => BlockId | 'outside'): void {
    this.recs.clear();
    if (!Array.isArray(rows)) return;
    for (const row of rows as unknown[]) {
      if (!Array.isArray(row) || row.length !== 5) continue;
      const [x, y, z, style, facing] = row as unknown[];
      if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number' || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) continue;
      if (!(STYLES as readonly unknown[]).includes(style) || !(FACINGS as readonly unknown[]).includes(facing)) continue;
      const block = blockAt(x, y, z);
      if (block === 'outside' || !isStyledBlock(block)) continue;
      this.set(x, y, z, style as Style, facing as Facing, block);
    }
  }
}

/** 案の ある 形の アイテム（`<ばしょ>_<形>_<案>`。例 `roof_kawara_shiro`）→ その 案。ほかの アイテム（案の ない 物・いつもの 物）は null */
export function styleOfItem(item: string): Style | null {
  for (const part of PARTS) {
    if (!item.startsWith(`${part}_`)) continue;
    const { form, style } = splitKind(item.slice(part.length + 1));
    if (style !== null && (PART_FORMS[part] as readonly string[]).includes(form)) return style;
  }
  return null;
}

/** どの 案か の 窓口が 読む 家の 記録 */
export interface LookBookPort {
  lookAt(x: number, y: number, z: number): string | null;
}

/**
 * 場所 (x, y, z) の しゅるいの id（`kawara_shiro` など）。順は ① 置いた ときの 記録 → ② 家の 記録（その マスの ブロックが その しゅるいの ブロックの とき だけ）→ ③ その 形の むら。
 * 案の ある 形の ブロックで なければ null
 */
export function resolveLook(d: { block: BlockId | 'outside'; placed: PlacedLooks; book: LookBookPort }, x: number, y: number, z: number): string | null {
  if (d.block === 'outside') return null;
  const f = FORM_OF_BLOCK.get(d.block);
  if (!f) return null;
  const placed = d.placed.get(x, y, z);
  if (placed) return `${f.form}_${placed.style}`;
  const kind = d.book.lookAt(x, y, z);
  if (kind !== null && splitKind(kind).form === f.form && kindBlocks(f.part, kind).includes(d.block)) return kind;
  return `${f.form}_mura`;
}
