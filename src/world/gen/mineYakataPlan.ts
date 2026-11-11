import { pickYokaiKind, effectiveRow, type YokaiRow } from '../../yokai/countryPick';
import type { YokaiKind } from '../../contracts';
import { KIND_TRAITS } from '../../yokai/traits';
import { COUNTRY_TABLE } from './countryTable';
import { countryAt } from './biome';
import { rollChest } from './mineChest';
import { chestSeed } from './mineChestTable';
import { shaftWorldFor, type ShaftWorld } from './mineShafts';
import type { Pt } from './mineShaftTypes';
import { YAKATA_TABLE as T, YAKATA_TUNING as TUNE, ZONE_LIST, type Look } from './mineYakataConfig';
import { regionOfShaftId, yakataLook } from './mineYakataRoll';
import type { Foe, Rank, Yakata } from './mineYakataTypes';
import { createRng, hashInts, subSeed } from './random';

/**
 * やかたの 計画の 答え〔窓口 `yakataPlanFor`・`yakataFoes`〕: やかたの 形・7 ひきの 種類と 二つ名と 出る 場所・宝箱の 中身の 予告（MINE-1F §4.1・§4.5・§6.1）。
 * 7 ひきは 世界の シードと 区画だけで きまる〔あける 前でも 同じ。見た目の くじ・あけた 人の 場所に よらない〕。
 */

export interface YakataPlan {
  yakata: Yakata;
  foes: Foe[];
  chestPreview: { item: string; count: number }[];
}

/** 二つ名の ならび〔先の 数ひきが おやぶん、のこりが たいしょう〕 */
function ranks(): Rank[] {
  return [...Array<Rank>(T.oyabun).fill('oyabun'), ...Array<Rank>(T.taisho).fill('taisho')];
}

/** 7 ひきの 種類〔大広間の まん中の 国の 行で 引く。ぬりかべは 1 ひき まで〕 */
function kindsOf(seed: number, y: Yakata): YokaiKind[] {
  const rz = regionOfShaftId(y.id)!;
  const rng = createRng(hashInts(subSeed(seed, TUNE.tags.foes), rz.rx, rz.rz));
  const cx = Math.floor((y.hall.x0 + y.hall.x1) / 2);
  const cz = Math.floor((y.hall.z0 + y.hall.z1) / 2);
  const country = countryAt(seed, cx, cz).kind;
  const base = COUNTRY_TABLE.find((r) => r.kind === 'harappa')?.yokai ?? {};
  const row: YokaiRow = effectiveRow(COUNTRY_TABLE.find((r) => r.kind === country)?.yokai ?? {}, {}, base);
  const out: YokaiKind[] = [];
  let limited = 0;
  for (let i = 0; i < ranks().length; i++) {
    const k = pickYokaiKind(row, {}, limited >= 1, rng()) ?? 'karakasa';
    if (KIND_TRAITS[k].limitedCount) limited++; // 数に 上限が ある 妖怪（ぬりかべ）は 1 体まで
    out.push(k);
  }
  return out;
}

/** 出る 場所の 並び: 区分を 左・右・前の じゅんに ひとつずつ〔どの 区分も のこりが なければ 別の 区分から〕。`blocked` の マスは さける */
export function foeSpots(y: Yakata, blocked: (p: Pt) => boolean): Pt[] | null {
  const left = new Map(ZONE_LIST.map((z) => [z, y.spawns.filter((s) => s.zone === z && !blocked(s.at)).map((s) => s.at)] as const));
  const out: Pt[] = [];
  const total = ranks().length;
  for (let i = 0; i < total; i++) {
    let list = left.get(ZONE_LIST[i % ZONE_LIST.length]!)!;
    if (list.length === 0) list = [...left.values()].sort((a, b) => b.length - a.length)[0]!;
    const at = list.shift();
    if (!at) return null;
    out.push(at);
  }
  return out;
}

export function foesOf(seed: number, y: Yakata): Foe[] {
  const kinds = kindsOf(seed, y);
  const spots = foeSpots(y, () => false) ?? [];
  const rk = ranks();
  return kinds.map((kind, i) => ({ kind, rank: rk[i]!, at: { ...spots[i]! } }));
}

/** 宝箱の 中身の 予告〔段 4・表 yakata。あけた とき もらう 物と 同じ〕 */
export function previewOf(seed: number, y: Yakata): { item: string; count: number }[] {
  const c = y.chest;
  return rollChest('yakata', chestSeed(seed, c.x, c.y, c.z), 4).items.map((it) => ({ item: it.item, count: it.count }));
}

/** 坑道 id の やかたの 計画〔なければ null〕。`looks` を わたすと 見た目の わりあいだけ かえて 引きなおす〔形・7 ひき・中身は かわらない〕 */
export function yakataPlanIn(world: ShaftWorld, seed: number, shaftId: string, opt?: { looks?: Record<Look, number> }): YakataPlan | null {
  const built = world.yakataOfShaft(shaftId);
  const r = regionOfShaftId(shaftId);
  if (!built || !r) return null;
  const yakata: Yakata = opt?.looks ? { ...built.yakata, look: yakataLook(seed, r.rx, r.rz, opt.looks) } : built.yakata;
  return { yakata, foes: foesOf(seed, built.yakata), chestPreview: previewOf(seed, built.yakata) };
}

/** 窓口の 外から〔モジュールの 入口〕: 古い 列の 一覧の ない 世界で 計画する */
export function yakataPlanFor(seed: number, shaftId: string, opt?: { looks?: Record<Look, number> }): YakataPlan | null {
  return yakataPlanIn(shaftWorldFor(seed), seed, shaftId, opt);
}
