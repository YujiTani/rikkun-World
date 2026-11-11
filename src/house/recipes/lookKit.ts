// HOUSE-2B（#364・仕様 3.3 版 docs/design/HOUSE-2.md §4.2・§6.1・§6.2 AC10〜AC13）ユニットテスト用の 道具（テスト専用。本番の コードからは 使わない）。
// 2B で 足される 窓口は 型の 上で まだ 無い ので、ここで 名前と 形を 約束する（本番に 足す 所は 下の 表。足したら この ファイルの 取り出しは そのまま 動く）。
//
// ---- 2B の 約束（tester が 決めた 名前。開発は これに そろえる。変えるなら この ファイルと 使う テストを 一緒に 直す）----
//   src/house/shape.ts
//     houseShape(bp)       bp の roof・wall・windowKind・door・deco・light（Blueprint の 項目。ない 項目は いつもの 物）を 読む。cells は 外の 箱（よこ outerW × たて outerD × 高さ houseBox の h）の
//                          ぜんぶの マスを 1 回ずつ（空気も）。箱の 外の マスは 返さない。やねの 段が ない ときも 同じ（h ＝ 4）。
//     houseBox(bp)         → { w, d, h }（仕様 §6.1）。w ＝ よこ ＋ 2・d ＝ たて ＋ 2・h ＝ §4.2 の 表（やね なし 4／たいら 5・かざり あり 6／ななめ 7・かざり あり 8。
//                          やねの 上の かざり ＝ えんとつ・しゃちほこ。やねが なしの ときは かざりが あっても 4。かべ・まどの なし と 案では かわらない）。
//     houseTriangles(bp)   → 数（その 家の 三角形。家具は のぞく。建てた 家の 区の メッシュで 数える 見こみ。面の 数×2 では なく、実際に 描く 三角形）。
//   src/house/recipes/kinds.ts
//     kindBlocks(part, kind) → BlockId[]  part は 'roof'|'wall'|'window'|'door'|'deco'|'light'。その しゅるいの **形**（かわら・しっくい・てつの と …）が 世界に 置く ブロックの id ぜんぶ（向き・戸の 半分・マスごとの ちがいも）。
//                              **ブロックの 番号は 形ごと（PO 決め 2026-11-11。256 に おさめる ため）**: 同じ 形の 3 案（mura・shiro・kozan）は 同じ id を 共有して よい（同じ 答えで よい）。
//                              ちがう 形の あいだでは 1 つも 重ならない。いつもの 物は 今の 家の ブロック（flat→['house_roof']・ki→['house_wall']・shoji→['shoji']・ie→ 戸の 4 つ・lantern→['lantern']）。
//                              やね・まどの 'none' は []。かべの 'none' は 4 すみの 柱の ブロック（1 つ 以上）。
//     kindItem(part, kind)   → ItemId | null  ほると 手に 入る アイテム（案ごとに 別。名前は `kindName(kind)`〔あかりは `LIGHT_NAME`〕）。やね・まどの 'none' は null。
//                              かべの 'none'（柱）は 柱を ほって 手に 入る 物が あれば その アイテム、なければ null。
//   src/house/shape.ts（つづき）
//     houseShape の cells の 各 マスに `look?: string`（その マスを 建てた しゅるいの id。例 'kawara_shiro'・'ki'・'tetsu_mura'）。床・家具・空気には ない。
//                          案が ちがえば sig（x・y・z・id・look）が ちがう。形が 案で ちがう 所（art）は ブロックの 位置も ちがう。
//     recordHouse(book, bp, number, at)  記録に 「どの 場所が どの しゅるいか」を のこす（looks）。HouseBook に `lookAt(x, y, z): string | null`（world の 場所 → しゅるいの id。記録に ない 場所は null）。
//                          かべ なし・やね なしの 家も 戸が あれば 記録に のる。
//   src/dig/dugItems.ts
//     dugItemAt(book, id, x, y, z) → ItemId  場所で 引く ほった アイテム。`book.lookAt(x, y, z)` が しゅるいの id なら その `kindItem`、なければ `dugItemOf(id)`（手で 置いた ブロック。案の 記録は 2C で 決める）。
//   src/house/build/sites.ts
//     siteOk(world, x, y, z, outW, outD, doorX, h = 5)       しらべる 段は 床の 上 1 〜 h − 1（h は houseBox の h）。h を 書かなければ 今まで どおり（5）。
//     findSites(world, px, py, pz, outW, outD, doorX, used = [], limit = 400, h = 5)   同じく 最後に h。
//   src/house/build/builder.ts
//     HouseBuilder.locked(x, y, z)   建築中の 場所の 高さは houseBox(bp).h（床の 段 ＋ 0 〜 h − 1）。bp に roof・deco が なければ 今まで どおり 5。
//   src/house/preview/mesh.ts
//     previewDrawCalls(state, mode)  → 数。見本を 描く 1 コマで レンダラーに 出す 描画の 数（光りは のぞく）。メッシュ 1 つ ＝ 1 回。かざり・やね・まどを 箱ごとに 描かず
//                                    材料の 絵ごとに まとめる ので、かざりの 数・窓の 数では ふえない。
//   足場の 三角形 2,000（build/plan.test.ts）は 家の 三角形の 上限では ない ので かえない。家の 上限は 3,000（houseTriangles）。
import type { BlockId, ItemId } from '../../contracts';
import type { Blueprint } from '../editor/blueprint';
import type { EditorState } from '../editor/model';
import type { PreviewMode } from '../preview/mesh';
import * as previewMod from '../preview/mesh';
import * as sitesMod from '../build/sites';
import type { SiteWorld } from '../build/sites';
import * as kindsMod from './kinds';
import type { Part } from './kinds';
import * as shapeMod from '../shape';
import * as dugMod from '../../dig/dugItems';
import type { HouseBook } from '../book';

export interface LookAt {
  lookAt(x: number, y: number, z: number): string | null;
}

export type LookPart = Part | 'light';
export interface Box {
  w: number;
  d: number;
  h: number;
}

/** 窓口が まだ 無い とき 読みやすい 形で 落とす */
function pick<T>(mod: unknown, name: string, where: string): T {
  const f = (mod as Record<string, unknown>)[name];
  if (typeof f !== 'function') throw new Error(`${name} が まだ ない（2B の 約束。${where}）`);
  return f as T;
}

export type BpIn = Pick<Blueprint, 'w' | 'd' | 'windows' | 'furniture'> & Partial<Blueprint>;
export const houseBox = (bp: BpIn): Box => pick<(b: unknown) => Box>(shapeMod, 'houseBox', 'src/house/shape.ts')(bp);
export const houseTriangles = (bp: BpIn): number => pick<(b: unknown) => number>(shapeMod, 'houseTriangles', 'src/house/shape.ts')(bp);
export const kindBlocks = (part: LookPart, kind: string): BlockId[] => pick<(p: string, k: string) => BlockId[]>(kindsMod, 'kindBlocks', 'src/house/recipes/kinds.ts')(part, kind);
export const kindItem = (part: LookPart, kind: string): ItemId | null => pick<(p: string, k: string) => ItemId | null>(kindsMod, 'kindItem', 'src/house/recipes/kinds.ts')(part, kind);
export const previewDrawCalls = (s: EditorState, mode: PreviewMode): number => pick<(s: EditorState, m: PreviewMode) => number>(previewMod, 'previewDrawCalls', 'src/house/preview/mesh.ts')(s, mode);

/** 高さ h を 渡せる siteOk（h を 渡さない 呼び方は 今の 型の まま 使える） */
export const siteOkH = (world: SiteWorld, x: number, y: number, z: number, outW: number, outD: number, doorX: number, h: number): boolean =>
  (sitesMod.siteOk as unknown as (...a: unknown[]) => boolean)(world, x, y, z, outW, outD, doorX, h);
export const findSitesH = (world: SiteWorld, px: number, py: number, pz: number, outW: number, outD: number, doorX: number, h: number): Array<{ x: number; y: number; z: number }> =>
  (sitesMod.findSites as unknown as (...a: unknown[]) => Array<{ x: number; y: number; z: number }>)(world, px, py, pz, outW, outD, doorX, [], 400, h);

/** せっけいず（テスト用）。いつもの 物・窓 0・家具 なしから、over で 上書き */
export function lookBp(over: Partial<Blueprint> = {}): Blueprint {
  return {
    number: 1,
    name: { front: 'もも', back: 'のいえ' },
    w: 5,
    d: 5,
    windows: 0,
    windowKind: 'shoji',
    roof: 'flat',
    wall: 'ki',
    door: 'ie',
    deco: [],
    furniture: [],
    light: 'lantern',
    ...over,
  };
}

/** ばしょ part の 知られた しゅるい ぜんぶ（表から。ALL_KINDS）。あかりは LIGHT_KINDS */
export const allKindsOf = (part: LookPart): string[] => (part === 'light' ? [...kindsMod.LIGHT_KINDS] : [...kindsMod.ALL_KINDS[part]]);

/** やねの 上に つく かざりの 形（仕様 §4.2。家の 箱が 1 段 高く なる） */
export const ROOF_TOP_FORMS: readonly string[] = ['entotsu', 'shachi'];
export const isRoofTop = (kind: string): boolean => ROOF_TOP_FORMS.includes(kindsMod.splitKind(kind).form);

/** 1 つの しゅるいだけ かえた せっけいず（part ごとの 項目に 入れる。deco は 1 つの 配列） */
export function withKind(part: LookPart, kind: string, base: Partial<Blueprint> = {}): Blueprint {
  const o: Partial<Blueprint> = { ...base };
  if (part === 'roof') o.roof = kind as Blueprint['roof'];
  else if (part === 'wall') o.wall = kind as Blueprint['wall'];
  else if (part === 'window') o.windowKind = kind as Blueprint['windowKind'];
  else if (part === 'door') o.door = kind as Blueprint['door'];
  else if (part === 'deco') o.deco = [kind as Blueprint['deco'][number]];
  else o.light = kind as Blueprint['light'];
  return lookBp(o);
}

/** 場所で 引く ほった アイテム（2B の 約束。dugItems.ts の dugItemAt） */
export const dugItemAt = (book: LookAt, id: BlockId, x: number, y: number, z: number): ItemId =>
  pick<(b: unknown, i: BlockId, x: number, y: number, z: number) => ItemId>(dugMod, 'dugItemAt', 'src/dig/dugItems.ts')(book, id, x, y, z);
/** 家の 記録の 本（lookAt を つけて 呼ぶ ため 型の 上で ひろげる） */
export type LookBook = HouseBook & LookAt;
/** しゅるいの id → ばしょ（id は ばしょを またいで 重ならない） */
export const partOfKind = (kind: string): LookPart => {
  for (const part of ['roof', 'wall', 'window', 'door', 'deco', 'light'] as const) if (allKindsOf(part).includes(kind)) return part;
  throw new Error(`しらない しゅるい ${kind}`);
};
