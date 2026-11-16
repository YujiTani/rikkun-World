import { WALLET_ITEM } from './walletPort';
import type { LegacyOrbs } from './dama';

/**
 * 古い セーブの 中の ようかいダマ（`yokai_orb`）を 数えて 取りのぞく（TOWN-1 1.6〔1F〕§4.6）。保存の データだけを 見る（画面・ゲームの 物に 触らない）。
 * もちもの（1P・2P。つまんで いた 物は 保存の とき マスに もどって いる）→ p1・p2、たんす・かまど・地面の 物・おとしもの ぶくろ → world（1P の さいふへ）。
 * もとの データは かえず、orb が あった 所だけ 写しを 作って 返す（同じ 古い セーブを 2 回 開いても 同じ 数）。
 */

interface Stack {
  item?: unknown;
  count?: unknown;
}
const isOrb = (x: unknown): x is Stack & { count: number } =>
  typeof x === 'object' && x !== null && (x as Stack).item === WALLET_ITEM && typeof (x as Stack).count === 'number' && Number.isFinite((x as Stack).count);

/** マスの 並び（空の マスは null）。orb の マスを null に して 数を 返す */
function clearSlots(slots: unknown): number {
  if (!Array.isArray(slots)) return 0;
  let n = 0;
  for (let i = 0; i < slots.length; i++) {
    if (isOrb(slots[i])) {
      n += Math.max(0, Math.floor((slots[i] as { count: number }).count));
      slots[i] = null;
    }
  }
  return n;
}

/** 物の 一覧（地面・かまど）。orb の 行を 取りのぞく（行の slots の 中も 見る） */
function clearList(list: unknown[]): number {
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (isOrb(e)) {
      n += Math.max(0, Math.floor(e.count));
      list.splice(i, 1);
    } else if (typeof e === 'object' && e !== null) {
      n += clearSlots((e as { slots?: unknown }).slots);
      const done = (e as { done?: unknown }).done;
      if (Array.isArray(done)) n += clearList(done);
    }
  }
  return n;
}

/** その 欄を 写して 取りのぞく。orb が なければ もとの まま（写さない） */
function cleaned<T>(value: T, clear: (copy: never) => number): { value: T; n: number } {
  if (!JSON.stringify(value ?? null).includes(WALLET_ITEM)) return { value, n: 0 };
  const copy = structuredClone(value);
  const n = clear(copy as never);
  return { value: n > 0 ? copy : value, n };
}

export function takeLegacyOrbs<M extends object>(meta: M): { data: M; orbs: LegacyOrbs } {
  const m = meta as Record<string, unknown>;
  const out: Record<string, unknown> = { ...m };
  const orbs: LegacyOrbs = { p1: 0, p2: 0, world: 0 };
  const inv = cleaned(m.inventory, (c: { slots?: unknown }) => clearSlots(c?.slots));
  out.inventory = inv.value;
  orbs.p1 = inv.n;
  const p2 = m.p2 as { inventory?: unknown } | null | undefined;
  if (typeof p2 === 'object' && p2 !== null) {
    const i2 = cleaned(p2.inventory, (c: { slots?: unknown }) => clearSlots(c?.slots));
    if (i2.n > 0) out.p2 = { ...p2, inventory: i2.value };
    orbs.p2 = i2.n;
  }
  for (const key of ['storage', 'bags', 'furnaces'] as const) {
    const v = m[key];
    if (!Array.isArray(v)) continue;
    const c = cleaned(v, (l: unknown[]) => clearList(l));
    out[key] = c.value;
    orbs.world += c.n;
  }
  const changed = orbs.p1 + orbs.p2 + orbs.world > 0;
  return { data: (changed ? out : meta) as M, orbs };
}
