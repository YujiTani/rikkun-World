/** にわとり の 動き（歩く・ついてくる・ワープ・地面 に あわせる・むき） */
import type { AnimalCore } from './animalCore';
import type { Vec3 } from '../contracts';
import { bodyInWall } from '../world/wall';
import { BODY, bodyFree, columnTop, supportTop } from './terrain';
import { inFootprint, inInterior } from './coop';
import type { Ent } from './animalTypes';
import { DT, FALL_G, FLUTTER_MIN_VY, FRIEND_MIN_GAP, HOME_RADIUS, KID_MARGIN, ROLL_MIN_DROP, ROLL_TICKS, TAU } from './animalConsts';
import { angleDiff, dist2d, FOLLOW_OFFS, SEP_OFFS, yawTo } from './animalMath';
import { isDeepWater } from '../world/blocks/water';

/** この 係 が 使う ものだけ（`AnimalCore` の 一部） */
type MoveCtx = Pick<AnimalCore, 'coopById' | 'coopList' | 'ents' | 'push' | 'rng' | 'setState' | 'settings' | 'world'>;

/** (ix, y, iz) に 立てる(上 2 マス くうき・みず でない) */
export function clear2(core: MoveCtx, ix: number, y: number, iz: number): boolean {
  const w = core.world;
  for (let k = 0; k < 2; k++) {
    if (w.isSolid(ix, y + k, iz) || isDeepWater(w.getBlock(ix, y + k, iz))) return false;
  }
  return true;
}

/**
 * 小屋 の きまり（§2.3）: 小屋 の 子 は 中 3×3 から 出ない。やせい・ついてくる 時間 が 0 の なかま は 5×5 に 外 から 入らない
 * （もん を 通れる の は ついてくる なかま と プレイヤー だけ）。
 */
function coopAllows(core: MoveCtx, e: Ent, nx: number, nz: number): boolean {
  if (e.home !== null) {
    const c = core.coopById(e.home);
    return !c || inInterior(c, nx, nz, KID_MARGIN);
  }
  if (e.friend && e.follow > 0) return true;
  for (const c of core.coopList) if (inFootprint(c, nx, nz) && !inFootprint(c, e.x, e.z)) return false;
  return true;
}

export function unbury(core: MoveCtx, e: Ent): boolean {
  const ix = Math.floor(e.x);
  const iz = Math.floor(e.z);
  const y0 = Math.floor(e.y + 0.4);
  for (let dy = 1; dy <= 3; dy++) {
    if (!core.world.isSolid(ix, y0 + dy, iz) && !core.world.isSolid(ix, y0 + dy + 1, iz) && y0 + dy + 1 < core.world.size.y) {
      e.y = y0 + dy;
      e.vy = 0;
      return true;
    }
  }
  return false;
}

/** 横 に うごく。だめ なら false(うごかない) */
export function tryMove(core: MoveCtx, e: Ent, dx: number, dz: number, maxDrop: number, allowWater: boolean): boolean {
  const w = core.world;
  const nx = e.x + dx;
  const nz = e.z + dz;
  const ix = Math.floor(nx);
  const iz = Math.floor(nz);
  if (!bodyInWall(nx, nz, BODY.radius, 0.5) || !w.isLoaded(ix, iz)) return false;
  if (core.coopList.length > 0 && !coopAllows(core, e, nx, nz)) return false;
  const top = supportTop(w, nx, nz, e.y, maxDrop);
  if (top === null) return false;
  if (top - e.y > BODY.stepUp + 1e-6) return false;
  // さく（高さ 1）には のぼらない: ついてくる なかま も もん から 入る（§2.3）
  if (core.coopList.length > 0 && top - e.y > 0.5 && w.getBlock(ix, Math.round(top) - 1, iz) === 'toriya_fence') return false;
  if (!bodyFree(w, nx, nz, top)) return false;
  if (!allowWater) {
    const tc = columnTop(w, ix, iz, Math.floor(e.y + BODY.stepUp + 1e-6) - 1, BODY.stepUp + maxDrop + 1);
    if (tc !== null && isDeepWater(w.getBlock(ix, tc, iz))) return false;
  }
  e.x = nx;
  e.z = nz;
  return true;
}

/** 段の ふち に またがって 止まった とき、体の まんなか を 高い 方へ そっと よせる（足もとが くうき に ならない ように） */
export function unstraddle(core: MoveCtx, e: Ent): void {
  const w = core.world;
  const ix = Math.floor(e.x);
  const iz = Math.floor(e.z);
  const startY = Math.floor(e.y + BODY.stepUp + 1e-6) - 1;
  const c = columnTop(w, ix, iz, startY, BODY.stepUp + 3);
  if (c === null || e.y - c < 0.5) return;
  for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const t = columnTop(w, ix + ox, iz + oz, startY, BODY.stepUp + 3);
    if (t !== null && t >= e.y - 1e-6) {
      tryMove(core, e, ox * 0.04, oz * 0.04, 3, false);
      return;
    }
  }
}

/** 足もと を 地面 に あわせる(落ちる・のぼる・みず に うく) */
export function settleOnGround(core: MoveCtx, e: Ent): void {
  const w = core.world;
  const ix = Math.floor(e.x);
  const iz = Math.floor(e.z);
  let cy = Math.floor(e.y + 0.3);
  if (isDeepWater(w.getBlock(ix, cy, iz))) {
    while (isDeepWater(w.getBlock(ix, cy + 1, iz))) cy++;
    const target = cy + 1 - 0.45;
    e.y += Math.max(-0.08, Math.min(0.08, target - e.y));
    e.vy = 0;
    e.fluttering = false;
    e.inWater = true;
    e.airFrom = -1;
    return;
  }
  e.inWater = false;
  const top = supportTop(w, e.x, e.z, e.y, w.size.y);
  if (top === null || e.y > top + 1e-4) {
    // 空中: パタパタ して ゆっくり 落ちる（下向き の 速さ は animalFlutterFallSpeed まで。ひよこ は chickFlutterFallSpeed。§2.9）
    if (e.airFrom < 0) e.airFrom = e.y;
    e.vy -= FALL_G * DT;
    const cap = e.stage === 'chick' ? core.settings.chickFlutterFallSpeed : core.settings.animalFlutterFallSpeed;
    if (e.vy < -cap) e.vy = -cap;
    e.y += e.vy * DT;
    if (top !== null && e.y <= top) {
      e.y = top;
      e.vy = 0;
      e.fluttering = false;
      landed(core, e, top);
    } else {
      e.fluttering = e.vy <= -FLUTTER_MIN_VY;
    }
  } else {
    e.vy = 0;
    e.fluttering = false;
    e.y = Math.min(top, e.y + 0.2);
    e.airFrom = -1;
  }
}

/** 着地: ひよこ が 高い 所 から おりた ときは コロン（前 に ころがって 起きる。§2.9） */
function landed(core: MoveCtx, e: Ent, top: number): void {
  const from = e.airFrom;
  e.airFrom = -1;
  if (e.stage !== 'chick' || from - top < ROLL_MIN_DROP) return;
  e.rollLeft = ROLL_TICKS;
  core.push({ type: 'roll', id: e.id });
}

export function warpToPlayer(core: MoveCtx, e: Ent, p: Vec3): boolean {
  const w = core.world;
  const others = core.ents.filter((o) => o !== e && o.friend && !o.carried);
  for (let i = 0; i < 40; i++) {
    const ang = core.rng() * TAU;
    const r = 2 + core.rng();
    const x = p.x + Math.cos(ang) * r;
    const z = p.z + Math.sin(ang) * r;
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    if (!w.isLoaded(ix, iz) || !bodyInWall(x, z, BODY.radius, 0.5)) continue;
    if (i < 30 && others.some((o) => dist2d(o.x, o.z, x, z) < FRIEND_MIN_GAP + 0.05)) continue;
    const base = Math.floor(p.y + 1e-6);
    for (const dy of [0, -1, 1]) {
      const t = base + dy;
      if (t < 1 || t >= w.size.y - 1) continue;
      if (!w.isSolid(ix, t - 1, iz) || w.isSolid(ix, t, iz) || w.isSolid(ix, t + 1, iz)) continue;
      if (!bodyFree(w, x, z, t)) continue;
      const from = { x: e.x, y: e.y, z: e.z };
      e.x = x;
      e.y = t;
      e.z = z;
      e.vy = 0;
      e.fluttering = false;
      e.following = false;
      e.stuck = 0;
      e.bestDist = Infinity;
      e.warpWait = 0;
      e.homeX = e.x;
      e.homeZ = e.z;
      core.push({ type: 'warp', id: e.id, from, to: { x: e.x, y: e.y, z: e.z } });
      return true;
    }
  }
  return false;
}

/** ワープ の 条件(§2.6)。ワープ した なら true */
export function friendWarpChecks(core: MoveCtx, e: Ent, p: Vec3, d: number, frozen: boolean): boolean {
  const s = core.settings;
  if (e.warpWait > 0) e.warpWait--;
  if (e.lockKind === 'appear' && e.lock > 0) return false;
  // ついてくる 時間 が 0 の なかま は とおく に いても ワープ しない（世界 の 下 だけ）
  const chasing = e.follow > 0;
  const far = chasing ? d > s.animalWarpDist || Math.abs(e.y - p.y) > 6 || e.y < -10 : e.y < -10;
  const stuck = chasing && !frozen && e.following && e.stuck >= s.animalStuckTicks;
  if (!far && !stuck) return false;
  if (e.warpWait > 0) return false;
  if (warpToPlayer(core, e, p)) return true;
  e.warpWait = 60;
  return false;
}

/** 小屋 の 子 が うまった: 中 の あいた マス へ。無ければ プレイヤー の そば で なかま に もどる（8 わ を こえて も ゆるす） */
export function kidRespawn(core: MoveCtx, e: Ent, p: Vec3): void {
  const c = e.home === null ? undefined : core.coopById(e.home);
  if (c) {
    const w = core.world;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const ix = c.x + dx;
      const iz = c.z + dz;
      if (w.isSolid(ix, c.y, iz) || w.isSolid(ix, c.y + 1, iz) || !w.isSolid(ix, c.y - 1, iz)) continue;
      e.x = ix + 0.5;
      e.y = c.y;
      e.z = iz + 0.5;
      e.vy = 0;
      return;
    }
  }
  e.home = null;
  e.follow = 0;
  e.x = p.x;
  e.y = p.y;
  e.z = p.z;
  e.vy = 0;
  e.homeX = e.x;
  e.homeZ = e.z;
}

export function turnAnimal(core: MoveCtx, e: Ent, p: Vec3, d: number): void {
  let want = e.yaw;
  const toP = yawTo(p.x - e.x, p.z - e.z);
  if (e.lock === 0) {
    if (e.fs === 'run' || e.fs === 'punch') want = e.walkYaw; // LIVE-4: 妖怪 の ほう を むく
    else if (e.fs !== 'none') want = d > 0.3 ? toP : e.yaw; // おうえん・かちポーズ は きみ の ほう
    else if (!e.friend || e.follow <= 0) want = e.look ? toP : e.walking ? e.walkYaw : e.yaw;
    else if (e.following) want = e.walkYaw;
    else if (d <= core.settings.animalLookDist && d > 0.3) want = toP;
  }
  const dy = angleDiff(e.yaw, want);
  e.yaw += Math.max(-0.25, Math.min(0.25, dy));
  const headWant = d <= core.settings.animalLookDist && d > 0.3 ? toP : e.yaw;
  e.headYaw += Math.max(-0.2, Math.min(0.2, angleDiff(e.headYaw, headWant)));
}

export function separateFriend(core: MoveCtx, e: Ent, p: Vec3): void {
  // 押されて プレイヤー に ぶつからない ように: 止まる 距離 より 内側 へは 押さない
  const keep = Math.min(dist2d(e.x, e.z, p.x, p.z), core.settings.animalFollowStop + e.stopOff);
  for (const o of core.ents) {
    if (o === e || !o.friend || o.carried) continue;
    let dx = e.x - o.x;
    let dz = e.z - o.z;
    let dd = Math.hypot(dx, dz);
    if (dd >= FRIEND_MIN_GAP + 0.04) continue;
    if (dd < 1e-6) {
      const a = e.id * 2.399;
      dx = Math.cos(a);
      dz = Math.sin(a);
      dd = 1;
    }
    const push = Math.min(0.05, FRIEND_MIN_GAP + 0.05 - Math.hypot(e.x - o.x, e.z - o.z) || 0.05);
    const ux = dx / dd;
    const uz = dz / dd;
    for (const off of SEP_OFFS) {
      const c = Math.cos(off);
      const sn = Math.sin(off);
      const mx = (ux * c - uz * sn) * push;
      const mz = (ux * sn + uz * c) * push;
      if (dist2d(e.x + mx, e.z + mz, p.x, p.z) < keep - 1e-6) continue;
      if (tryMove(core, e, mx, mz, core.world.size.y, true)) break;
    }
  }
}

export function behaveAnimal(core: MoveCtx, e: Ent, p: Vec3, d: number): void {
  const s = core.settings;
  if (e.friend && e.follow > 0) {
    followPlayer(core, e, p, d);
    return;
  }
  // やせい（と ついてくる 時間 が 0 の なかま: とまった 所 から 6 マス 以内）
  e.look = d <= s.animalLookDist;
  if (e.look) {
    core.setState(e, 'look');
    return;
  }
  if (e.walking) {
    core.setState(e, 'wander');
    if (e.friend && dist2d(e.x, e.z, e.homeX, e.homeZ) > HOME_RADIUS - 0.5) e.walkYaw = yawTo(e.homeX - e.x, e.homeZ - e.z);
    const ok = angleDiff(e.yaw, e.walkYaw) < 0.8 && angleDiff(e.yaw, e.walkYaw) > -0.8;
    if (ok) {
      const v = s.animalWanderSpeed * DT;
      if (!tryMove(core, e, Math.sin(e.walkYaw) * v, -Math.cos(e.walkYaw) * v, BODY.wanderDrop, false)) {
        e.walkYaw = core.rng() * TAU - Math.PI;
        if (++e.blocked >= 3) startRest(core, e);
      } else {
        e.blocked = 0;
      }
    }
    if (--e.walkLeft <= 0) startRest(core, e);
  } else {
    core.setState(e, 'rest');
    if (--e.restLeft <= 0) {
      e.walking = true;
      e.walkLeft = 120 + Math.floor(core.rng() * 181);
      e.walkYaw = core.rng() * TAU - Math.PI;
      e.blocked = 0;
    }
  }
}

function startRest(core: MoveCtx, e: Ent): void {
  e.walking = false;
  e.restLeft = 120 + Math.floor(core.rng() * 121);
  e.blocked = 0;
}

export function followPlayer(core: MoveCtx, e: Ent, p: Vec3, d: number): void {
  const s = core.settings;
  if (!e.following && d > s.animalFollowStart) {
    e.following = true;
    e.bestDist = d;
    e.stuck = 0;
  } else if (e.following && d <= s.animalFollowStop + e.stopOff) {
    e.following = false;
  }
  if (!e.following) {
    core.setState(e, 'idle');
    e.bestDist = Infinity;
    e.stuck = 0;
    return;
  }
  core.setState(e, 'follow');
  if (d < e.bestDist - 0.5) {
    e.bestDist = d;
    e.stuck = 0;
  } else if (d > s.animalFollowStart) {
    e.stuck++;
  }
  const base = yawTo(p.x - e.x, p.z - e.z);
  let v = s.animalFollowSpeed * DT * (e.inWater ? 0.5 : 1);
  v = Math.min(v, Math.max(0, d - 0.05));
  e.walkYaw = base;
  for (const off of FOLLOW_OFFS) {
    const a = base + off;
    if (tryMove(core, e, Math.sin(a) * v, -Math.cos(a) * v, core.world.size.y, true)) return;
  }
}
