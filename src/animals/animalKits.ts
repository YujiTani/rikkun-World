/** LIVE-2 こたつ（たまご を あたためる・かえる） */
import type { AnimalCore } from './animalCore';
import { isBigKotatsu, kotatsuAnchorOf } from '../world/blocks/kotatsu';
import type { ItemId, KitEgg, KitIcon, KitInfo, KitUseResult, Vec3 } from '../contracts';
import { rollBreed } from './hatch';
import type { Kit, KitEggRow } from './animalTypes';
import { BLOCK_NUKUNUKU, FRIEND_FULL_REPEAT, HATCH_MACHO_TICKS, HATCH_TICKS, KIT_HATCH_GAP, KIT_ICON_DIST, SPOT_RETRY } from './animalConsts';
import { dist2d, inFootprintAny } from './animalMath';
import { isDeepWater } from '../world/blocks/water';

/** この 係 が 使う ものだけ（`AnimalCore` の 一部） */
type KitCtx = Pick<AnimalCore, 'breedRng' | 'breedState' | 'coopList' | 'd' | 'dropGold' | 'ents' | 'find' | 'friendCount' | 'getPlayer' | 'hintOut' | 'kitList' | 'kitScratch' | 'make' | 'push' | 'settings' | 'world'>;

/** その マス が こたつ の 3 マス の どれか なら 本体 の マス。ほか は そのまま */
function kitAnchor(core: KitCtx, x: number, y: number, z: number): { x: number; y: number; z: number } {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const a = kotatsuAnchorOf(String(core.world.getBlock(ix, iy, iz)), ix, iz);
  return { x: a.x, y: iy, z: a.z };
}

/** 本体 の まわり に 3 マス が そろって いれば 2、古い 1 マス こたつ なら 1 */
function kitSize(core: KitCtx, k: { x: number; y: number; z: number }): 1 | 2 {
  return isBigKotatsu((x, y, z) => String(core.world.getBlock(x, y, z)), k.x, k.y, k.z) ? 2 : 1;
}

export function listKits(core: KitCtx): KitInfo[] {
  return core.kitList.map((k) => kitInfo(core, k, { x: 0, y: 0, z: 0, egg: null, left: 0, wobble: 0, eggs: [] }, true));
}

/** その マス の こたつ（たまご が 入って いる もの だけ） */
export function kitAt(core: KitCtx, x: number, y: number, z: number): KitInfo | null {
  const a = kitAnchor(core, x, y, z);
  const k = core.kitList.find((o) => o.x === a.x && o.y === a.y && o.z === a.z);
  return k ? kitInfo(core, k, { x: 0, y: 0, z: 0, egg: null, left: 0, wobble: 0, eggs: [] }, true) : null;
}

/**
 * 右クリック: こたつ を ねらった（LIVE-2 §2.1・LIVE-2.1 §2.4）。`held` = 持って いる もの。
 * 入れた → 'put'（C が 1 つ へらす）。その こたつ が 3 こ → 'full'（kitFull）・たまご じゃ ない 物 → 'wait'（入って いる）／'needEgg'（から）・
 * あたためる たまご が 世界 ぜんぶ で 6 こ → 'max'（kitMax）。どれ も 合図 は ここ で 出す。
 * 置ける 物 を 持って いる とき の「となり に 置く」は C が 決めて、この 口 は 呼ばない。
 */
export function useKit(core: KitCtx, x: number, y: number, z: number, held: ItemId | null): KitUseResult {
  // こたつ 2×2: 4 マス の どれ を ねらって も 本体（北西 の マス）の こたつ 1 台 として あつかう
  const { x: ix, y: iy, z: iz } = kitAnchor(core, x, y, z);
  const egg: KitEgg | null = held === 'egg' ? 'egg' : held === 'kin_tamago' ? 'gold' : null;
  const kit = core.kitList.find((k) => k.x === ix && k.y === iy && k.z === iz);
  if (kit && !egg) {
    core.hintOut('kitWait');
    return 'wait';
  }
  if (!egg || String(core.world.getBlock(ix, iy, iz)) !== BLOCK_NUKUNUKU) {
    core.hintOut('kitNeedEgg');
    return 'needEgg';
  }
  if (kit && kit.eggs.length >= core.settings.kitEggMax) {
    core.hintOut('kitFull');
    return 'full';
  }
  if (kitEggCount(core) >= core.settings.kitActiveMax) {
    core.hintOut('kitMax');
    return 'max';
  }
  const total = Math.max(1, Math.round(core.settings.kitHatchTicks));
  const row: KitEggRow = { egg, left: total, total };
  if (kit) kit.eggs.push(row);
  else core.kitList.push({ x: ix, y: iy, z: iz, eggs: [row], chick: 0, hatch: null, gap: 0, fullWait: 0, retry: 0 });
  return 'put';
}

/** 世界 ぜんぶ で あたため 中 の たまご の 数 */
function kitEggCount(core: KitCtx): number {
  let n = 0;
  for (const k of core.kitList) n += k.eggs.length;
  return n;
}

/**
 * 天板 の 上 の たまご の 3 わく（LIVE-2.1 §3.2・AC12）。プレイヤー 水平 8 以内 の こたつ（たまご が 入って いる）と、
 * たまご を 持って ねらって いる こたつ（から でも 3 わく とも null）。
 */
export function kitIcons(core: KitCtx, aimed: { x: number; y: number; z: number } | null, holdingEgg: boolean): KitIcon[] {
  const out: KitIcon[] = [];
  const p = core.getPlayer().position;
  const a = aimed && holdingEgg ? kitAnchor(core, aimed.x, aimed.y, aimed.z) : null;
  const row = (k: Kit | null, x: number, y: number, z: number): KitIcon => {
    const slots: KitIcon['slots'] = [];
    for (let i = 0; i < core.settings.kitEggMax; i++) {
      const r = k?.eggs[i];
      slots.push(r ? { egg: r.egg, fill: r === k?.hatch ? 1 : Math.max(0, Math.min(1, 1 - r.left / Math.max(1, r.total))), wobble: eggWobble(r) } : { egg: null, fill: 0, wobble: 0 });
    }
    return { x, y, z, slots };
  };
  let aimedDone = false;
  for (const k of core.kitList) {
    const isAimed = !!a && a.x === k.x && a.y === k.y && a.z === k.z;
    const half = (k.size ?? 1) / 2;
    if (isAimed) aimedDone = true;
    if (!isAimed && dist2d(k.x + half, k.z + half, p.x, p.z) > KIT_ICON_DIST) continue;
    out.push(row(k, k.x, k.y, k.z));
  }
  if (a && !aimedDone && String(core.world.getBlock(a.x, a.y, a.z)) === BLOCK_NUKUNUKU) out.push(row(null, a.x, a.y, a.z));
  return out;
}

/** B が 描く: こたつ（たまご が 入って いる もの）。`hatchT` = かえる 動き の 進み 0〜1（動き 中 で ない とき 0）。同じ 行 を 使いまわす */
export function forEachKit(core: KitCtx, fn: (k: KitInfo & { hatchT: number }) => void): void {
  const r = core.kitScratch;
  for (const k of core.kitList) {
    kitInfo(core, k, r, false);
    r.size = kitSize(core, k);
    const c = k.chick !== 0 ? core.find(k.chick) : undefined;
    r.hatchT = c && c.lock > 0 && c.lockKind === 'hatch' ? 1 - c.lock / Math.max(1, c.lockTotal) : 0;
    fn(r);
  }
}

/** のこり 2/3 以上 = じっと・1/3 以上 = ときどき・それ より 少ない = よく ゆれる（LIVE-2 §2.1。LIVE-2.1: たまご ごと） */
function eggWobble(r: KitEggRow | undefined): 0 | 1 | 2 {
  if (!r) return 0;
  return r.left * 3 >= r.total * 2 ? 0 : r.left * 3 >= r.total ? 1 : 2;
}

/** `deep` = たまご の 行 を 新しく 作って 入れる（窓口 用）。しない とき は 使いまわす 入れもの に 書く（描く 側 用） */
function kitInfo(core: KitCtx, k: Kit, out: KitInfo, deep: boolean): KitInfo {
  out.x = k.x;
  out.y = k.y;
  out.z = k.z;
  const first = k.eggs[0];
  out.egg = first ? first.egg : null;
  out.left = first ? first.left : 0;
  out.wobble = eggWobble(first);
  if (deep) {
    out.size = kitSize(core, k);
    out.eggs = k.eggs.map((r) => ({ egg: r.egg, left: r.left, wobble: eggWobble(r) }));
  } else {
    const list = out.eggs ?? (out.eggs = []);
    list.length = k.eggs.length;
    for (let i = 0; i < k.eggs.length; i++) {
      const r = k.eggs[i]!;
      const q = list[i];
      if (q) {
        q.egg = r.egg;
        q.left = r.left;
        q.wobble = eggWobble(r);
      } else list[i] = { egg: r.egg, left: r.left, wobble: eggWobble(r) };
    }
  }
  return out;
}

/** 毎ステップ の こたつ（LIVE-2 §2.1・LIVE-2.1 §2.4）。時間 は 世界 の 時計 で たまご ごと に すすむ（はなれて いても） */
export function updateKits(core: KitCtx, p: Vec3): void {
  const s = core.settings;
  for (let i = core.kitList.length - 1; i >= 0; i--) {
    const k = core.kitList[i]!;
    for (const r of k.eggs) if (r.left > 0) r.left--;
    if (k.chick !== 0) {
      // かえる 動き 中: おわったら（ひよこ の ロック が とけた）その たまご は なくなり、20 ステップ あけて 次
      const c = core.find(k.chick);
      if (!c) {
        k.chick = 0;
        k.hatch = null;
      } else if (c.lock === 0 || c.lockKind !== 'hatch') {
        const at = k.hatch ? k.eggs.indexOf(k.hatch) : -1;
        if (at >= 0) k.eggs.splice(at, 1);
        k.chick = 0;
        k.hatch = null;
        k.gap = KIT_HATCH_GAP;
        if (k.eggs.length === 0) core.kitList.splice(i, 1);
        continue;
      } else continue;
    }
    // こたつ を こわした: たまご は 種類 ごと に もどる（あたため は 0）
    if (core.world.isLoaded(k.x, k.z) && String(core.world.getBlock(k.x, k.y, k.z)) !== BLOCK_NUKUNUKU) {
      core.kitList.splice(i, 1);
      const half = (k.size ?? 1) / 2;
      const at = { x: k.x + half, y: k.y + 0.5, z: k.z + half };
      for (const r of k.eggs) {
        if (r.egg === 'gold') core.dropGold(at);
        else core.d.dropEgg(at);
      }
      continue;
    }
    k.size = kitSize(core, k);
    if (k.gap > 0 && --k.gap > 0) continue;
    const ready = k.eggs.find((r) => r.left <= 0);
    if (!ready) continue;
    // あたため おわり: 近く に いて、なかま が 8 わ より 少ない とき に かえる
    if (dist2d(k.x + 0.5, k.z + 0.5, p.x, p.z) > s.kitHatchDist || Math.abs(p.y - k.y) > 8) {
      k.fullWait = 0;
      continue;
    }
    if (core.friendCount() >= s.animalFriendMax) {
      if (k.fullWait <= 0) {
        core.hintOut('friendFull');
        k.fullWait = FRIEND_FULL_REPEAT;
      } else k.fullWait--;
      continue;
    }
    k.fullWait = 0;
    if (k.retry > 0) {
      k.retry--;
      continue;
    }
    startHatch(core, k, ready, p);
  }
}

function startHatch(core: KitCtx, k: Kit, row: KitEggRow, p: Vec3): void {
  const spot = findHatchSpot(core, k, p);
  if (!spot) {
    k.retry = SPOT_RETRY;
    return;
  }
  const breed = rollBreed(row.egg, core.settings, core.breedState, core.breedRng);
  const e = core.make(spot.x, spot.y, spot.z, true, 0, core.settings.animalFollowTicks);
  e.stage = 'chick';
  e.breed = breed;
  e.fromGold = row.egg === 'gold';
  const ticks = breed === 'macho' ? HATCH_MACHO_TICKS : HATCH_TICKS;
  e.lockTotal = ticks;
  e.lock = ticks;
  e.lockKind = 'hatch';
  e.state = 'hatch';
  core.ents.push(e);
  k.chick = e.id;
  k.hatch = row;
  core.push({ type: 'hatchStart', x: k.x, y: k.y, z: k.z });
}

/** こたつ の まわり の 地面（プレイヤー に 近い 方 から）。無ければ こたつ の 上。それ も だめ なら null */
function findHatchSpot(core: KitCtx, k: Kit, p: Vec3): Vec3 | null {
  const w = core.world;
  const n = kitSize(core, k);
  const sides: [number, number][] = [];
  for (let i = 0; i < n; i++) sides.push([-1, i], [n, i], [i, -1], [i, n]);
  const dd = (a: [number, number]) => (k.x + a[0] + 0.5 - p.x) ** 2 + (k.z + a[1] + 0.5 - p.z) ** 2;
  sides.sort((a, b) => dd(a) - dd(b));
  for (const [dx, dz] of sides) {
    const ix = k.x + dx;
    const iz = k.z + dz;
    if (!w.isLoaded(ix, iz)) continue;
    if (!w.isSolid(ix, k.y - 1, iz) || w.isSolid(ix, k.y, iz) || w.isSolid(ix, k.y + 1, iz)) continue;
    if (isDeepWater(w.getBlock(ix, k.y, iz))) continue;
    if (inFootprintAny(core.coopList, ix + 0.5, iz + 0.5)) continue;
    return { x: ix + 0.5, y: k.y, z: iz + 0.5 };
  }
  if (!w.isSolid(k.x, k.y + 1, k.z) && !w.isSolid(k.x, k.y + 2, k.z)) return { x: k.x + 0.5, y: k.y + 1, z: k.z + 0.5 };
  return null;
}
