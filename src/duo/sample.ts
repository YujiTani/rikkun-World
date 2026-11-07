// COOP-1 4a（§12.0 `duo.sample`）: 2 人用 もちもの画面を「いちばん 多い とき」に して 見る ための 見本の もちもの（`?duo=dev` だけで 使う）。
// 中身は アイテムの 登録表・レシピの 登録表の 並びから 決まった 順で 選ぶ（id を 直書きしない。同じ 版なら いつも 同じ 中身）。
import type { ItemId, ItemStack, ItemType, Recipe } from '../contracts';

/** 材料が この しゅるい数 以上の レシピを さがす（「材料が 4 しゅるい」。なければ いちばん 多い 物） */
const WANT_KINDS = 4;

/**
 * 見本の マスの 中身（マスの 番号 0〜size-1。0〜8 は ホットバー）。数は その 物の マスの 上限（maxStack）。
 * 先に 入れる 物（ホットバーに 見える）: 名前の いちばん 長い 物 → 材料が 4 しゅるいの レシピの 材料。のこりは 登録表の 並びで うめる。
 * そうびは 入れない（4b で 足す）
 */
export function sampleStacks(items: readonly ItemType[], recipes: readonly Recipe[], size: number): ItemStack[] {
  const out: ItemStack[] = [];
  const seen = new Set<ItemId>();
  const put = (id: ItemId): void => {
    if (seen.has(id) || out.length >= size) return;
    const t = items.find((i) => i.id === id);
    if (!t || t.maxStack <= 0) return;
    seen.add(id);
    out.push({ item: id, count: t.maxStack });
  };
  // 名前の いちばん 長い 物（同じ 長さなら 登録表で 先の 物）
  let longest: ItemType | null = null;
  for (const t of items) if (t.maxStack > 0 && (!longest || t.name.length > longest.name.length)) longest = t;
  if (longest) put(longest.id);
  // 材料が 4 しゅるいの レシピ（なければ 材料が いちばん 多い レシピ）の 材料
  let pick: Recipe | null = null;
  for (const r of recipes) {
    const kinds = new Set(r.inputs.map((s) => s.item)).size;
    const best = pick ? new Set(pick.inputs.map((s) => s.item)).size : -1;
    if (kinds >= WANT_KINDS ? best < WANT_KINDS : kinds > best) pick = r;
  }
  for (const s of pick?.inputs ?? []) put(s.item);
  for (const t of items) put(t.id);
  return out;
}
