import type { ItemId, LegendaryAttackFx, LegendaryCharge, LegendaryDef, NushiDropRow, W2Settings } from '../contracts';

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

/** 手に 持っている 間の 速さの 倍率（passive moveMul の 積。レジェンダリーでない 物・手が 空 は 1）。WEAPON-7 §4.2 */
export function legendMoveMulOf(S: Pick<W2Settings, 'legendary'>, item: ItemId | null | undefined): number {
  let m = 1;
  for (const p of legendDefOf(S, item)?.passive ?? []) if (p.kind === 'moveMul') m *= p.mul;
  return m;
}

/** ふつうの わざに 足す 真空波（なければ null） */
export function waveOf(S: Pick<W2Settings, 'legendary'>, item: ItemId | null | undefined): Extract<LegendaryAttackFx, { kind: 'wave' }> | null {
  const a = legendDefOf(S, item)?.onAttack.find((x) => x.kind === 'wave');
  return a && a.kind === 'wave' ? a : null;
}

/** その 武器の ためわざ（ためない 武器・レジェンダリーでない 物は null） */
export function chargeOf(S: Pick<W2Settings, 'legendary'>, item: ItemId | null | undefined): LegendaryCharge | null {
  return legendDefOf(S, item)?.charge ?? null;
}

/**
 * 強さ P（`weaponDamage` の かわり）。レジェンダリーでない 物は null。
 * `[最小, 最大]` は 落ちた ときに 1 本ごとに 決める（PR3）。それまでは 整数の まん中
 */
export function legendPowerOf(S: Pick<W2Settings, 'legendary'>, item: ItemId | null | undefined, stackPower?: number | null): number | null {
  const d = legendDefOf(S, item);
  if (!d) return null;
  if (typeof d.power === 'number') return d.power;
  if (typeof stackPower === 'number' && stackPower > 0) return stackPower; // WEAPON-9: 1 本ごとの 強さ
  return Math.round((d.power[0] + d.power[1]) / 2);
}

/** 1 本ごとに 強さが ちがう（[最小, 最大]）武器か */
export function hasPowerRange(S: Pick<W2Settings, 'legendary'>, item: ItemId | null | undefined): boolean {
  const d = legendDefOf(S, item);
  return !!d && Array.isArray(d.power);
}

/** 落ちた 1 本の 強さを 決める（[最小, 最大] なら 整数を 同じ 重さで。数字ひとつ・レジェンダリーでない 物は null）。乱数を 1 つ 使う（範囲の ときだけ） */
export function rollPower(S: Pick<W2Settings, 'legendary'>, item: ItemId, rng: () => number): number | null {
  const d = legendDefOf(S, item);
  if (!d || typeof d.power === 'number') return null;
  const [lo, hi] = d.power;
  return Math.min(hi, lo + Math.floor(rng() * (hi - lo + 1)));
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
