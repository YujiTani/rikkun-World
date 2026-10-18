import type { ItemId, LegendaryCharge, LegendaryDef, NushiDropRow, W2Settings } from '../contracts';

/**
 * WEAPON-7 §2.1: レジェンダリー武器の データを 引く 口。武器を 足すときは 設定 `legendary` に 1 つ 足すだけ
 * （ため・強さ・ヌシの 表が この データに したがう）。
 */

export function legendDefOf(S: Pick<W2Settings, 'legendary'>, item: ItemId | null | undefined): LegendaryDef | undefined {
  if (!item) return undefined;
  return S.legendary.find((d) => d.item === item);
}

/** ふつうの わざに 足す きせき（`onAttack` の trail）。なければ null */
export function trailStyleOf(S: Pick<W2Settings, 'legendary'>, item: ItemId | null | undefined): 'thunder' | 'rainbow' | null {
  const d = legendDefOf(S, item);
  const t = d?.onAttack.find((a) => a.kind === 'trail');
  return t && t.kind === 'trail' ? t.style : null;
}

/** その 武器の ためわざ（ためない 武器・レジェンダリーでない 物は null） */
export function chargeOf(S: Pick<W2Settings, 'legendary'>, item: ItemId | null | undefined): LegendaryCharge | null {
  return legendDefOf(S, item)?.charge ?? null;
}

/**
 * 強さ P（`weaponDamage` の かわり）。レジェンダリーでない 物は null。
 * `[最小, 最大]` は 落ちた ときに 1 本ごとに 決める（PR3）。それまでは 整数の まん中
 */
export function legendPowerOf(S: Pick<W2Settings, 'legendary'>, item: ItemId | null | undefined): number | null {
  const d = legendDefOf(S, item);
  if (!d) return null;
  return typeof d.power === 'number' ? d.power : Math.round((d.power[0] + d.power[1]) / 2);
}

/**
 * ヌシの 表から weight で ランダムに 1 本（§2.3）。持っているか・前に 何が 出たかは 見ない。
 * 乱数は 1 つだけ 使う。表が 空・weight が ぜんぶ 0 なら null
 */
export function pickNushiDrop(rows: readonly NushiDropRow[], rng: () => number): ItemId | null {
  let total = 0;
  for (const r of rows) if (r.weight > 0) total += r.weight;
  if (!(total > 0)) return null;
  let x = rng() * total;
  for (const r of rows) {
    if (!(r.weight > 0)) continue;
    if (x < r.weight) return r.item;
    x -= r.weight;
  }
  return rows.filter((r) => r.weight > 0).at(-1)!.item;
}
