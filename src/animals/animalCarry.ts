/** だっこ・おろす・なげる（LIVE-1 版 3.2・LIVE-2.1 §2.2） */
import type { AnimalCore } from './animalCore';
import type { AnimalHintKind, ThrowAim, ThrowSpot, Vec3 } from '../contracts';
import { bodyFree } from './terrain';
import { inFootprint } from './coop';
import type { Coop, Ent } from './animalTypes';
import { GLIDE_STEP, PUT_DOWN_TICKS, THROW_APEX_UP, THROW_BASE_TICKS, THROW_FRONT, THROW_HAND_Y, THROW_LAND_Y, THROW_LIFT_TICKS, THROW_SCAN_DOWN, THROW_SOFT_DIST, THROW_THROUGH, THROW_TICKS_PER_M } from './animalConsts';
import { angleDiff, dist2d, yawTo } from './animalMath';
import { joinCoop } from './animalCoops';
import { settleOnGround, warpToPlayer } from './animalMove';

/** この 係 が 使う ものだけ（`AnimalCore` の 一部） */
type CarryCtx = Pick<AnimalCore, 'breedState' | 'carriedId' | 'coopAtSpot' | 'coopById' | 'coopList' | 'd' | 'dropGold' | 'ents' | 'everCarried' | 'find' | 'friendCount' | 'getPlayer' | 'goldRng' | 'hintOut' | 'kidCount' | 'lastDay' | 'lockHintAt' | 'nextCoopId' | 'push' | 'putWhy' | 'rng' | 'setLock' | 'setState' | 'settings' | 'targetId' | 'tick' | 'tryAdd' | 'wildAnnounced' | 'world'>;

/** 右クリック の 押しつづけ（§2.8）。`heldTicks` = 押してから の ステップ 数 */
export function carryHold(core: CarryCtx, id: number, heldTicks: number): 'lifted' | 'wait' | 'wild' | null {
  const e = core.find(id);
  if (!e || e.carried || e.meat || core.carriedId !== null) return null;
  const hold = core.settings.carryHoldTicks;
  if (!e.friend) {
    if (heldTicks < hold) {
      core.wildAnnounced = false;
      return 'wait';
    }
    if (core.wildAnnounced) return null;
    core.wildAnnounced = true;
    return 'wild';
  }
  if (heldTicks < hold || e.lock > 0) return 'wait';
  const p = core.getPlayer().position;
  e.carried = true;
  e.following = false;
  e.walking = false;
  e.stuck = 0;
  e.fluttering = false;
  e.vy = 0;
  e.x = p.x;
  e.y = p.y;
  e.z = p.z;
  core.carriedId = id;
  core.everCarried = true;
  core.setState(e, 'carried');
  core.push({ type: 'carry', id });
  return 'lifted';
}

/** おろす（§2.8）。`spot` = 足もと の 位置。固い マス・読みこんで いない 所 は false */
export function putDownAnimal(core: CarryCtx, spot: Vec3): boolean {
  const e = core.carriedId === null ? undefined : core.find(core.carriedId);
  if (!e) return false;
  const w = core.world;
  const ix = Math.floor(spot.x);
  const iz = Math.floor(spot.z);
  const iy = Math.floor(spot.y + 1e-6);
  core.putWhy = null;
  if (!w.isLoaded(ix, iz) || iy < 0 || iy >= w.size.y) return false;
  if (!bodyFree(w, spot.x, spot.z, spot.y)) return false;
  // 小屋 の 中 に おろす → 小屋 の 子（6 わ なら おろさない）。小屋 の 子 を 外 に おろす → なかま（8 わ なら おろさない）
  const into = core.coopAtSpot(spot);
  if (into) {
    if (core.kidCount(into.id, e) >= core.settings.coopMax) {
      core.hintOut('coopFull');
      core.putWhy = 'coopFull';
      return false;
    }
  } else if (e.home !== null && core.friendCount() >= core.settings.animalFriendMax) {
    core.hintOut('friendFull');
    core.putWhy = 'friendFull';
    return false;
  }
  e.carried = false;
  e.liftLeft = 0;
  e.putLeft = 0;
  e.plan = null;
  core.carriedId = null;
  e.x = spot.x;
  e.y = spot.y;
  e.z = spot.z;
  e.vy = 0;
  e.following = false;
  e.walking = false;
  e.stuck = 0;
  e.bestDist = Infinity;
  e.warpWait = 0;
  e.homeX = e.x;
  e.homeZ = e.z;
  e.restLeft = 20 + Math.floor(core.rng() * 40);
  if (into) {
    if (e.home !== into.id) joinCoop(core, e, into);
  } else if (e.home !== null) {
    e.home = null;
    e.follow = 0;
  }
  core.push({ type: 'putDown', id: e.id, x: e.x, y: e.y, z: e.z });
  core.setLock(e, 'putDown', PUT_DOWN_TICKS);
  return true;
}

/** やられた とき: だっこ中 を その場に おろす（地面 の 検査 は しない。出来事 putDown は 出す） */
export function dropCarried(core: CarryCtx, spot: Vec3): void {
  if (putDownAnimal(core, spot)) return;
  const e = core.carriedId === null ? undefined : core.find(core.carriedId);
  if (!e) return;
  e.carried = false;
  e.liftLeft = 0;
  e.putLeft = 0;
  e.plan = null;
  core.carriedId = null;
  e.x = spot.x;
  e.y = spot.y;
  e.z = spot.z;
  e.vy = 0;
  e.following = false;
  e.walking = false;
  e.homeX = e.x;
  e.homeZ = e.z;
  core.push({ type: 'putDown', id: e.id, x: e.x, y: e.y, z: e.z });
  core.setLock(e, 'putDown', PUT_DOWN_TICKS);
}

function carriedEnt(core: CarryCtx): Ent | undefined {
  return core.carriedId === null ? undefined : core.find(core.carriedId);
}

/** 立てる マス（上 が 固く ない・下 が 固い・体 が ぶつからない） */
function standable(core: CarryCtx, ix: number, y: number, iz: number): boolean {
  const w = core.world;
  if (!w.isLoaded(ix, iz) || y < 1 || y >= w.size.y - 1) return false;
  return !w.isSolid(ix, y, iz) && !w.isSolid(ix, y + 1, iz) && w.isSolid(ix, y - 1, iz) && bodyFree(w, ix + 0.5, iz + 0.5, y);
}

/**
 * ねらった の が とりごや の さく・もん なら、線 を 通して その 先 の 床（さく に 入って から 4 マス 以内）の 上 の 空き マス を 返す。
 * 無ければ null（今まで どおり さく の 上 へ よせる）。左クリック の 照準 は かわらない（さく に 当たる）
 */
function throughFence(core: CarryCtx, aim: ThrowAim): Vec3 | null {
  const d = aim.dir3;
  if (!d || (aim.hitId !== 'toriya_fence' && aim.hitId !== 'toriya_gate')) return null;
  const w = core.world;
  const isFence = (id: string) => id === 'toriya_fence' || id === 'toriya_gate';
  let enter = -1;
  let prev: Vec3 | null = null;
  for (let t = 0; t <= 16; t += 0.05) {
    const ix = Math.floor(aim.eye.x + d.x * t);
    const iy = Math.floor(aim.eye.y + d.y * t);
    const iz = Math.floor(aim.eye.z + d.z * t);
    if (!w.isLoaded(ix, iz) || iy < 0 || iy >= w.size.y) return null;
    const id = String(w.getBlock(ix, iy, iz));
    if (isFence(id)) {
      if (enter < 0) enter = t;
      continue;
    }
    if (enter < 0) continue;
    if (t - enter > THROW_THROUGH) return null;
    if (w.isSolid(ix, iy, iz)) return prev && !(prev.x === ix && prev.y === iy && prev.z === iz) ? prev : null;
    prev = { x: ix, y: iy, z: iz };
  }
  return null;
}

/** 着地点 の 答え。`pt` = テスト 用（足もと の 点 を そのまま 使う） */
function planThrow(core: CarryCtx, e: Ent, aim: ThrowAim | null, pt?: Vec3): ThrowSpot {
  const w = core.world;
  const p = core.getPlayer().position;
  const range = core.settings.throwRange;
  const bad = (x: number, y: number, z: number, why: AnimalHintKind | null = 'cantPutHere'): ThrowSpot => ({ x, y, z, ok: false, home: null, toss: true, why });
  let x: number;
  let y: number;
  let z: number;
  if (pt) {
    x = pt.x;
    y = pt.y;
    z = pt.z;
    if (!w.isLoaded(Math.floor(x), Math.floor(z)) || w.isSolid(Math.floor(x), Math.floor(y + 1e-6), Math.floor(z))) return bad(x, y, z);
  } else if (aim && aim.place) {
    const through = throughFence(core, aim);
    const pl = through ?? aim.place;
    const cx = pl.x + 0.5;
    const cz = pl.z + 0.5;
    const dd = dist2d(p.x, p.z, cx, cz);
    if (dd <= range) {
      x = cx;
      y = pl.y;
      z = cz;
    } else {
      // とおい: プレイヤー → その マス の 向き で range の 所 の 列。同じ 高さ ±1 で 立てる マス
      const ix = Math.floor(p.x + ((cx - p.x) / dd) * range);
      const iz = Math.floor(p.z + ((cz - p.z) / dd) * range);
      let found: number | null = null;
      for (const dy of [0, 1, -1]) {
        if (standable(core, ix, pl.y + dy, iz)) {
          found = pl.y + dy;
          break;
        }
      }
      if (found === null) return bad(ix + 0.5, pl.y, iz + 0.5);
      x = ix + 0.5;
      y = found;
      z = iz + 0.5;
    }
  } else if (aim) {
    // 何も ねらわない: 前 3 マス の 列。目 の 高さ から 下 へ 見て はじめ に 立てる マス
    const ix = Math.floor(p.x + aim.dirX * THROW_FRONT);
    const iz = Math.floor(p.z + aim.dirZ * THROW_FRONT);
    x = ix + 0.5;
    z = iz + 0.5;
    if (!w.isLoaded(ix, iz)) return bad(x, p.y, z);
    const y0 = Math.floor(aim.eye.y);
    if (w.isSolid(ix, y0, iz)) return bad(x, y0, z);
    y = aim.eye.y - THROW_SCAN_DOWN;
    for (let n = 0; n <= THROW_SCAN_DOWN; n++) {
      if (w.isSolid(ix, y0 - n - 1, iz)) {
        y = y0 - n;
        break;
      }
    }
  } else {
    return bad(p.x, p.y, p.z);
  }
  if (y < 0 || y >= w.size.y || !w.isLoaded(Math.floor(x), Math.floor(z))) return bad(x, y, z);
  if (!bodyFree(w, x, z, y)) return bad(x, y, z);
  const spot = { x, y, z };
  const into = core.coopAtSpot(spot);
  if (into && core.kidCount(into.id, e) >= core.settings.coopMax) return { x, y, z, ok: false, home: into.id, toss: true, why: 'coopFull' };
  if (!into && e.home !== null && core.friendCount() >= core.settings.animalFriendMax) return { x, y, z, ok: false, home: null, toss: true, why: 'friendFull' };
  const toss = pt ? true : dist2d(p.x, p.z, x, z) >= THROW_SOFT_DIST;
  return { x, y, z, ok: true, home: into ? into.id : null, toss, why: null };
}

/** だっこ 中 の 着地点（照準 の 下 の 語・丸）。だっこ して いなければ null */
export function throwSpot(core: CarryCtx, aim: ThrowAim): ThrowSpot | null {
  const e = carriedEnt(core);
  return e ? planThrow(core, e, aim) : null;
}

/** 右クリック（だっこ 中）: なげる（d＜1 は 20 ステップ で そっと おろす）。なげられない 所 は 合図 を 出して false */
export function startThrow(core: CarryCtx, aim: ThrowAim): boolean {
  const e = carriedEnt(core);
  if (!e || e.liftLeft > 0 || e.putLeft > 0) return false;
  return beginThrow(core, e, planThrow(core, e, aim));
}

/** テスト 用: その 足もと の 点 へ なげる */
export function throwTo(core: CarryCtx, x: number, y: number, z: number): boolean {
  const e = carriedEnt(core);
  if (!e || e.liftLeft > 0 || e.putLeft > 0) return false;
  return beginThrow(core, e, planThrow(core, e, null, { x, y, z }));
}

function beginThrow(core: CarryCtx, e: Ent, sp: ThrowSpot): boolean {
  core.putWhy = null;
  if (!sp.ok) {
    core.putWhy = sp.why;
    core.hintOut(sp.why ?? 'cantPutHere');
    return false;
  }
  e.plan = sp;
  if (sp.toss) e.liftLeft = THROW_LIFT_TICKS;
  else e.putLeft = PUT_DOWN_TICKS;
  return true;
}

/** そっと おろす の おわり（20 ステップ） */
export function finishSoftPut(core: CarryCtx, e: Ent): void {
  const plan = e.plan;
  e.plan = null;
  if (!plan) return;
  if (!putDownAnimal(core, { x: plan.x, y: plan.y, z: plan.z })) {
    const why = core.putWhy ?? 'cantPutHere';
    if (core.putWhy === null) core.hintOut(why);
  }
}

/** 手 から はなれる（もちあげ 10 ステップ の おわり） */
export function releaseThrow(core: CarryCtx, e: Ent, p: Vec3): void {
  const plan = e.plan!;
  e.plan = null;
  e.carried = false;
  core.carriedId = null;
  e.following = false;
  e.walking = false;
  e.stuck = 0;
  e.bestDist = Infinity;
  e.warpWait = 0;
  e.fluttering = false;
  e.vy = 0;
  e.x = p.x;
  e.y = p.y;
  e.z = p.z;
  const sy = p.y + THROW_HAND_Y;
  const py = plan.y + THROW_LAND_Y;
  const T = Math.max(1, Math.round(THROW_BASE_TICKS + THROW_TICKS_PER_M * dist2d(p.x, p.z, plan.x, plan.z)));
  const delta = py - sy;
  const h = Math.max(sy, py) + THROW_APEX_UP - sy;
  const c = 2 * h - delta + 2 * Math.sqrt(Math.max(0, h * (h - delta)));
  e.flight = { sx: p.x, sy, sz: p.z, tx: plan.x, ty: plan.y, tz: plan.z, c, py, T, k: 0, phase: 'arc' };
  core.setState(e, 'thrown');
  core.push({ type: 'toss', id: e.id, to: { x: plan.x, y: plan.y, z: plan.z } });
  if (bodyFree(core.world, p.x, p.z, sy)) e.y = sy;
  else bonk(core, e);
}

/** とちゅう で 当たった: 1 つ 前 の 位置 に もどし、その 場 から まっすぐ パタパタ で おりる */
function bonk(core: CarryCtx, e: Ent): void {
  const f = e.flight!;
  f.phase = 'fall';
  e.vy = 0;
  e.airFrom = e.y;
  core.push({ type: 'bonk', id: e.id, x: e.x, y: e.y, z: e.z });
}

/** とんで いる 1 ステップ。着地 したら false を 返さず 内部 で 小屋 の 子 など を きめる */
export function flightStep(core: CarryCtx, e: Ent, p: Vec3): void {
  const f = e.flight!;
  e.stateTicks++;
  e.fluttering = false;
  if (f.phase === 'arc') {
    f.k++;
    const u = Math.min(1, f.k / f.T);
    const nx = f.sx + (f.tx - f.sx) * u;
    const nz = f.sz + (f.tz - f.sz) * u;
    const ny = f.sy + (f.py - f.sy) * u + f.c * u * (1 - u);
    if (!core.world.isLoaded(Math.floor(nx), Math.floor(nz)) || !bodyFree(core.world, nx, nz, ny)) {
      bonk(core, e);
      return;
    }
    e.x = nx;
    e.y = ny;
    e.z = nz;
    e.vy = 0;
    if (f.k >= f.T) {
      f.phase = 'fall';
      e.airFrom = e.y;
    }
    return;
  }
  // 着地する 列 が まだ 読まれて いない: その場 で とまって まつ（読まれたら つづき。落ち続けて ワープ しない）
  if (!core.world.isLoaded(Math.floor(e.x), Math.floor(e.z))) return;
  if (e.y < -10) {
    // 下 に 地面 が 無い: プレイヤー の そば へ もどす
    e.flight = null;
    e.airFrom = -1;
    warpToPlayer(core, e, p);
    core.setState(e, 'idle');
    return;
  }
  settleOnGround(core, e);
  if (e.vy === 0 && !e.fluttering && e.airFrom < 0) landThrown(core, e, p);
}

/** 着地: 出来事 putDown。さく の 上 なら 中 へ よせる。そうでなければ その 場 の 小屋 の きまり */
function landThrown(core: CarryCtx, e: Ent, p: Vec3): void {
  e.flight = null;
  e.homeX = e.x;
  e.homeZ = e.z;
  e.restLeft = 20 + Math.floor(core.rng() * 40);
  core.push({ type: 'putDown', id: e.id, x: e.x, y: e.y, z: e.z });
  const w = core.world;
  const under = String(w.getBlock(Math.floor(e.x), Math.round(e.y) - 1, Math.floor(e.z)));
  if (under.startsWith('toriya_')) {
    const g = glideTarget(core, e, p);
    if (g) {
      e.glide = g;
      core.setState(e, 'idle');
      return;
    }
  }
  finishLanding(core, e);
}

/** さく・もん・ねぐら の 上 に 着いた: 小屋 の 中 3×3 の いちばん 近い あき マス（6 わ なら 外 の プレイヤー がわ の 地面） */
function glideTarget(core: CarryCtx, e: Ent, p: Vec3): { x: number; z: number } | null {
  const w = core.world;
  let coop: Coop | undefined;
  for (const c of core.coopList) if (inFootprint(c, e.x, e.z)) coop = c;
  if (!coop) return null;
  const c = coop;
  const cells: [number, number][] = [];
  const full = core.kidCount(c.id, e) >= core.settings.coopMax;
  for (let a = -3; a <= 3; a++) {
    for (let b = -3; b <= 3; b++) {
      const inner = Math.abs(a) <= 1 && Math.abs(b) <= 1;
      const ring = Math.max(Math.abs(a), Math.abs(b)) === 3;
      if (full ? !ring : !inner) continue;
      const ix = c.x + a;
      const iz = c.z + b;
      if (!w.isLoaded(ix, iz) || w.isSolid(ix, c.y, iz) || w.isSolid(ix, c.y + 1, iz) || !w.isSolid(ix, c.y - 1, iz)) continue;
      cells.push([ix, iz]);
    }
  }
  if (cells.length === 0) return null;
  const ref = full ? p : e;
  let best = cells[0]!;
  let bd = Infinity;
  for (const [ix, iz] of cells) {
    const d = (ix + 0.5 - ref.x) ** 2 + (iz + 0.5 - ref.z) ** 2;
    if (d < bd) {
      bd = d;
      best = [ix, iz];
    }
  }
  return { x: best[0] + 0.5, z: best[1] + 0.5 };
}

/** よせる 1 ステップ（0.5 マス / 12 ステップ） */
export function glideStep(core: CarryCtx, e: Ent): void {
  const g = e.glide!;
  e.stateTicks++;
  if (!core.world.isLoaded(Math.floor(g.x), Math.floor(g.z))) return;
  const dx = g.x - e.x;
  const dz = g.z - e.z;
  const d = Math.hypot(dx, dz);
  if (d <= GLIDE_STEP) {
    e.x = g.x;
    e.z = g.z;
    e.glide = null;
    settleOnGround(core, e);
    finishLanding(core, e);
    return;
  }
  e.x += (dx / d) * GLIDE_STEP;
  e.z += (dz / d) * GLIDE_STEP;
  e.yaw += Math.max(-0.25, Math.min(0.25, angleDiff(e.yaw, yawTo(dx, dz))));
  settleOnGround(core, e);
}

/** 着いた 所 で 小屋 の 子 か なかま か を きめる（中 3×3 → 小屋 の 子・外 → なかま） */
function finishLanding(core: CarryCtx, e: Ent): void {
  const into = core.coopAtSpot(e);
  if (into && core.kidCount(into.id, e) < core.settings.coopMax) {
    if (e.home !== into.id) {
      joinCoop(core, e, into);
      core.setLock(e, 'cheer', 20);
      return;
    }
  } else if (e.home !== null && !(into && e.home === into.id)) {
    e.home = null;
    e.follow = 0;
  }
  core.setLock(e, 'putDown', PUT_DOWN_TICKS);
}
