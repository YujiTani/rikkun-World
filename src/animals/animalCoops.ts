/** LIVE-2 とりごや（置く・あつめる・こわす・小屋 の 子・たまご を うむ） */
import type { AnimalCore } from './animalCore';
import type { CoopBreakResult, CoopInfo, CoopPlacePreview, CoopPlaceResult, Vec3 } from '../contracts';
import { COOP_HALF, COOP_HEIGHT, COOP_SHIFTS, type CoopDir, coopFits, coopsOverlap, gateCell, inInterior } from './coop';
import { rollGold } from './gold';
import type { Coop, Ent } from './animalTypes';
import { GROW_TICKS } from './animalConsts';
import { dist2d } from './animalMath';
import { doorOf } from './animalMeat';

/** この 係 が 使う ものだけ（`AnimalCore` の 一部） */
type CoopCtx = Pick<AnimalCore, 'breedState' | 'coopAtSpot' | 'coopById' | 'coopList' | 'd' | 'dropGold' | 'ents' | 'find' | 'getPlayer' | 'goldRng' | 'hintOut' | 'kidCount' | 'lastDay' | 'lockHintAt' | 'nextCoopId' | 'push' | 'rng' | 'setLock' | 'setState' | 'settings' | 'targetId' | 'tick' | 'tryAdd' | 'world'>;

/** 小屋 を 置く（ゲーム の 置く と 同じ 判定。ねらった 所 が だめ なら まわり 8 か所）。x・z は 5×5 の まん中、y は いちばん 下 の 空気 の 高さ */
export function placeCoop(core: CoopCtx, x: number, y: number, z: number, dir: CoopDir = 0): CoopPlaceResult {
  if (!core.d.placeCoopBlocks) return 'noRoom';
  if (core.coopList.length >= core.settings.coopCountMax) {
    core.hintOut('coopMax');
    return 'max';
  }
  const at = findCoopSpot(core, x, y, z);
  if (!at || !core.d.placeCoopBlocks(at.x, y, at.z, dir)) {
    core.hintOut('coopNoRoom');
    return 'noRoom';
  }
  const c: Coop = { id: core.nextCoopId++, x: at.x, y, z: at.z, dir, egg: 0, gold: 0, meat: null };
  core.coopList.push(c);
  return c.id;
}

export function previewCoop(core: CoopCtx, x: number, y: number, z: number, dir: CoopDir = 0): CoopPlacePreview {
  const at = core.d.placeCoopBlocks && core.coopList.length < core.settings.coopCountMax ? findCoopSpot(core, x, y, z) : null;
  return at ? { x: at.x, y, z: at.z, dir, ok: true } : { x, y, z, dir, ok: false };
}

export function listCoops(core: CoopCtx): CoopInfo[] {
  return core.coopList.map((c) => coopInfo(core, c));
}

/** その ブロック を 持つ 小屋（まわり の わ。さく・もん・ねぐら・すばこ） */
export function coopAt(core: CoopCtx, x: number, y: number, z: number): CoopInfo | null {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  for (const c of core.coopList) {
    const dx = Math.abs(ix - c.x);
    const dz = Math.abs(iz - c.z);
    if (dx > COOP_HALF || dz > COOP_HALF || (dx !== COOP_HALF && dz !== COOP_HALF)) continue;
    if (iy < c.y || iy >= c.y + COOP_HEIGHT) continue;
    return coopInfo(core, c);
  }
  return null;
}

/** 右クリック: 小屋 の すばこ の たまご を ぜんぶ 持ち物 へ（入らない 分 は のこる）。あつめた 数 */
export function collectCoop(core: CoopCtx, coopId: number): { egg: number; gold: number } {
  const c = core.coopById(coopId);
  if (!c) return { egg: 0, gold: 0 };
  let egg = 0;
  let gold = 0;
  while (c.gold > 0 && core.tryAdd('kin_tamago')) {
    c.gold--;
    gold++;
  }
  while (c.egg > 0 && core.tryAdd('egg')) {
    c.egg--;
    egg++;
  }
  if (egg + gold > 0) core.push({ type: 'coopCollect', egg, gold });
  return { egg, gold };
}

/** 左クリック を 押した: 中 に 子 が いれば 'locked'（押した ステップ だけ 合図 と 出来事。だっこ 中 の 子 も 数える） */
export function breakCoop(core: CoopCtx, coopId: number, firstPress: boolean): CoopBreakResult {
  const c = core.coopById(coopId);
  if (!c || core.kidCount(c.id) === 0) return 'ok';
  if (firstPress) {
    core.hintOut('coopNotEmpty');
    core.lockHintAt = core.tick;
    core.push({ type: 'coopLocked', coop: c.id });
  } else if (core.tick - core.lockHintAt >= 100) {
    // 押し つづけて いる あいだ は 合図 の チップ が 消えない よう 100 ステップ ごと に 出し直す（出来事 coopLocked は 出さない）
    core.hintOut('coopNotEmpty');
    core.lockHintAt = core.tick;
  }
  return 'locked';
}

/** 小屋 を 消す（子 0 の とき だけ。いれば false）。すばこ の たまご を おとし、ブロック は `removeCoopBlocks` で ぜんぶ 消す */
export function removeCoop(core: CoopCtx, coopId: number): boolean {
  const i = core.coopList.findIndex((c) => c.id === coopId);
  if (i < 0) return false;
  const c = core.coopList[i]!;
  if (core.kidCount(c.id) > 0) return false;
  core.coopList.splice(i, 1);
  const at = { x: c.x + 0.5, y: c.y + 0.3, z: c.z + 0.5 };
  // toriya 1 は C が 持ち物 に わたす。すばこ の たまご は ここ で おとす
  for (let n = 0; n < c.egg; n++) {
    if (core.d.dropItem) core.d.dropItem(at, 'egg');
    else core.d.dropEgg(at);
  }
  for (let n = 0; n < c.gold; n++) core.dropGold(at);
  core.d.removeCoopBlocks?.(c.x, c.y, c.z, c.dir);
  return true;
}

/** ひよこ から 数えて 種類 の くじ の はずれ 数（保存 される）。`n` を 渡す と 設定 */
export function machoMiss(core: CoopCtx, n?: number): number {
  if (n !== undefined && Number.isFinite(n)) core.breedState.machoMiss = Math.max(0, Math.round(n));
  return core.breedState.machoMiss;
}

/** B が 描く: 小屋（すばこ の 数 と 子 の 数） */
export function forEachCoop(core: CoopCtx, fn: (c: CoopInfo) => void): void {
  for (const c of core.coopList) fn(coopInfo(core, c));
}

function coopInfo(core: CoopCtx, c: Coop): CoopInfo {
  const kids: number[] = [];
  for (const e of core.ents) if (e.home === c.id) kids.push(e.id);
  const door = doorOf(core, c);
  return {
    id: c.id,
    x: c.x,
    y: c.y,
    z: c.z,
    dir: c.dir,
    gate: gateCell(c.x, c.z, c.dir),
    kids,
    nest: { egg: c.egg, gold: c.gold },
    door: door.door,
    doorT: door.t,
    meatBusy: c.meat ? c.meat.id : null,
  };
}

/** ねらった 所 → まわり 8 か所 の 順 に ためして、入る 5×5×4 の まん中（他の 小屋 と かさならない） */
function findCoopSpot(core: CoopCtx, x: number, y: number, z: number): { x: number; z: number } | null {
  for (const [sx, sz] of COOP_SHIFTS) {
    const cx = x + sx;
    const cz = z + sz;
    if (!coopFits(core.world, cx, y, cz)) continue;
    const at = { x: cx, y, z: cz };
    if (core.coopList.some((c) => coopsOverlap(c, at))) continue;
    return { x: cx, z: cz };
  }
  return null;
}

/** 小屋 の 子 に する（`announce` = 出来事 `home` を 出す） */
export function joinCoop(core: CoopCtx, e: Ent, c: Coop, announce = true): void {
  e.home = c.id;
  e.follow = 0;
  e.following = false;
  e.walking = false;
  e.stuck = 0;
  e.bestDist = Infinity;
  e.warpWait = 0;
  e.enterT = 0;
  e.homeX = c.x + 0.5;
  e.homeZ = c.z + 0.5;
  e.restLeft = 20 + Math.floor(core.rng() * 40);
  if (announce) {
    e.popAge = 0;
    core.push({ type: 'home', id: e.id, coop: c.id });
  }
}

export function makeKid(core: CoopCtx, e: Ent, c: Coop): void {
  joinCoop(core, e, c, false);
}

/** あさ（`day()` が ふえた 時）: 小屋 の ひよこ の そだつ 日 ＋1（上限 chickGrowDays） */
export function checkMorning(core: CoopCtx): void {
  const day = core.d.day();
  if (core.lastDay === null || day < core.lastDay) {
    core.lastDay = day;
    return;
  }
  if (day === core.lastDay) return;
  const n = day - core.lastDay;
  core.lastDay = day;
  const max = core.settings.chickGrowDays;
  for (const e of core.ents) if (e.home !== null && e.stage === 'chick') e.grow = Math.min(max, e.grow + n);
}

/** 小屋 の 子 の ひよこ が 大人 に なれる か（あさ 2 回 むかえた・プレイヤー が 小屋 から 近い） */
export function growCheck(core: CoopCtx, e: Ent, p: Vec3): void {
  if (e.home === null || e.stage !== 'chick' || e.grow < core.settings.chickGrowDays) return;
  const c = core.coopById(e.home);
  if (!c) return;
  const s = core.settings;
  if (dist2d(c.x + 0.5, c.z + 0.5, p.x, p.z) > s.kitHatchDist || Math.abs(p.y - c.y) > 8) return;
  core.push({ type: 'growStart', id: e.id });
  e.lockTotal = GROW_TICKS;
  core.setLock(e, 'grow', GROW_TICKS);
}

/** 小屋 の 中 3×3 に ついてきて 入った なかま: coopEnterTicks で 小屋 の 子 */
export function enterCheck(core: CoopCtx, e: Ent): void {
  if (e.home !== null || !e.friend || e.carried || e.follow <= 0 || core.coopList.length === 0) {
    e.enterT = 0;
    return;
  }
  const c = core.coopAtSpot(e);
  if (!c || core.kidCount(c.id) >= core.settings.coopMax) {
    e.enterT = 0;
    return;
  }
  if (++e.enterT < core.settings.coopEnterTicks) return;
  joinCoop(core, e, c);
  core.setLock(e, 'cheer', 20);
}

/** 夜: 小屋 の 子 は 中 で すわって ねる */
export function sleepKid(core: CoopCtx, e: Ent): void {
  e.walking = false;
  e.look = false;
  e.following = false;
  core.setState(e, 'sleep');
}

/** 小屋 の 子 が 外 に 出て いたら 中 の まん中 へ（落とされた・ブロック が 動いた とき） */
export function kidKeepInside(core: CoopCtx, e: Ent): void {
  const c = e.home === null ? undefined : core.coopById(e.home);
  if (!c) {
    // 小屋 が 無く なった: なかま に もどる
    e.home = null;
    e.follow = 0;
    return;
  }
  if (inInterior(c, e.x, e.z, 0)) return;
  e.x = c.x + 0.5;
  e.z = c.z + 0.5;
  e.y = c.y;
  e.vy = 0;
  e.walking = false;
  e.homeX = e.x;
  e.homeZ = e.z;
}

/** 金 かどうか きめて、小屋 の すばこ か 足もと に たまご を 出す（§2.6・§2.8） */
export function layEgg(core: CoopCtx, e: Ent): void {
  const roll = rollGold(core.goldRng, { raised: e.raised, bugs: e.bugs, goldMiss: e.goldMiss, natsuki: e.natsuki, breed: e.breed }, core.settings);
  e.goldMiss = roll.goldMiss;
  const gold = roll.gold;
  const coop = e.home === null ? undefined : core.coopById(e.home);
  if (coop && coop.egg + coop.gold < core.settings.coopNestMax) {
    if (gold) coop.gold++;
    else coop.egg++;
    core.push(gold ? { type: 'egg', id: e.id, x: e.x, y: e.y, z: e.z, gold: true, coop: coop.id } : { type: 'egg', id: e.id, x: e.x, y: e.y, z: e.z, coop: coop.id });
    return;
  }
  const at = { x: e.x, y: e.y + 0.3, z: e.z };
  if (gold) core.dropGold(at);
  else core.d.dropEgg(at);
  core.push(gold ? { type: 'egg', id: e.id, x: e.x, y: e.y, z: e.z, gold: true } : { type: 'egg', id: e.id, x: e.x, y: e.y, z: e.z });
}

/** 小屋 の ブロック が 世界 から 消えて いたら（ほかの しかた で こわれた）小屋 の きろく を すてる。子 は なかま に もどる */
export function checkCoopBlocks(core: CoopCtx): void {
  for (let i = core.coopList.length - 1; i >= 0; i--) {
    const c = core.coopList[i]!;
    if (!core.world.isLoaded(c.x, c.z) || coopHasBlocks(core, c)) continue;
    core.coopList.splice(i, 1);
    for (const e of core.ents) {
      if (e.home !== c.id) continue;
      e.home = null;
      e.follow = 0;
      e.homeX = e.x;
      e.homeZ = e.z;
    }
  }
}

function coopHasBlocks(core: CoopCtx, c: Coop): boolean {
  const w = core.world;
  for (let a = -COOP_HALF; a <= COOP_HALF; a++) {
    for (let b = -COOP_HALF; b <= COOP_HALF; b++) {
      if (Math.abs(a) !== COOP_HALF && Math.abs(b) !== COOP_HALF) continue;
      for (let dy = 0; dy < 3; dy++) if (String(w.getBlock(c.x + a, c.y + dy, c.z + b)).startsWith('toriya_')) return true;
    }
  }
  return false;
}
