/** 1 ステップ（出す・update・1 わ ぶん の step・ロック の おわり） */
import type { AnimalCore } from './animalCore';
import type { AnimalSpawnOpts, AnimalState, Vec3 } from '../contracts';
import { bodyInWall } from '../world/wall';
import { BODY, surfaceY } from './terrain';
import type { Coop, Ent } from './animalTypes';
import { APPEAR_TICKS, COOP_CHECK_EVERY, HEART_REMOVE_DIST, POP_TICKS, TAU } from './animalConsts';
import { dist2d, inFootprintAny } from './animalMath';
import { natsukiTick } from './animalCare';
import { finishSoftPut, flightStep, glideStep, releaseThrow } from './animalCarry';
import { checkCoopBlocks, checkMorning, enterCheck, growCheck, kidKeepInside, layEgg, makeKid, sleepKid } from './animalCoops';
import { fightStep, fightStop, pickFightersNow } from './animalFight';
import { updateKits } from './animalKits';
import { meatBird, meatTick } from './animalMeat';
import { behaveAnimal, clear2, friendWarpChecks, kidRespawn, separateFriend, settleOnGround, turnAnimal, unbury, unstraddle, warpToPlayer } from './animalMove';

/** この 係 が 使う ものだけ（`AnimalCore` の 一部） */
type LifeCtx = Pick<AnimalCore, 'bangBuf' | 'breedRng' | 'breedState' | 'carriedId' | 'catches' | 'coopAtSpot' | 'coopById' | 'coopCheckT' | 'coopList' | 'd' | 'dropGold' | 'eggRng' | 'ents' | 'everCarried' | 'everGrew' | 'everHatched' | 'fightCands' | 'fighterIds' | 'find' | 'friendCount' | 'getPlayer' | 'goldRng' | 'hintOut' | 'joinSeq' | 'kidCount' | 'kitList' | 'kitScratch' | 'lastDay' | 'lockHintAt' | 'lockState' | 'make' | 'markOut' | 'nextCoopId' | 'nextStopOff' | 'night' | 'oneFighter' | 'push' | 'putWhy' | 'rng' | 'setLock' | 'setState' | 'settings' | 'spawnTimer' | 'targetId' | 'tick' | 'tryAdd' | 'waitHintAt' | 'wildAnnounced' | 'world'>;

export function spawnAnimal(core: LifeCtx, x: number, y: number, z: number, opts: AnimalSpawnOpts = {}): number | null {
  // 小屋 の 子 として 置く（`home`）: 小屋 が 無い・6 わ いる → null
  let coop: Coop | undefined;
  if (opts.home !== undefined && opts.home !== null) {
    coop = core.coopById(opts.home);
    if (!coop || core.kidCount(coop.id) >= core.settings.coopMax) return null;
  }
  const friend = opts.friend === true || coop !== undefined;
  if (friend && !coop && core.friendCount() >= core.settings.animalFriendMax) return null;
  const max = core.settings.animalFollowTicks;
  const follow = friend && !coop ? Math.max(0, Math.min(max, Math.round(opts.follow ?? max))) : 0;
  const e = core.make(x, y, z, friend, friend ? 0 : (opts.hearts ?? 0), follow);
  e.fullLeft = Math.max(0, Math.round(opts.fullLeft ?? 0));
  e.stage = opts.stage === 'chick' ? 'chick' : 'adult';
  e.breed = opts.breed === 'macho' ? 'macho' : 'normal';
  e.raised = opts.raised === true;
  e.bugs = Math.max(0, Math.round(opts.bugs ?? 0));
  e.goldMiss = Math.max(0, Math.round(opts.goldMiss ?? 0));
  e.grow = Math.max(0, Math.round(opts.grow ?? 0));
  if (e.friend && e.stage === 'adult') {
    const s = core.settings;
    e.natsuki = Math.max(0, Math.min(s.natsukiMax, Math.round(opts.natsuki ?? 0)));
    e.natsukiBugWait = Math.max(0, Math.min(s.natsukiBugWaitTicks, Math.round(opts.natsukiBugWait ?? 0)));
    e.natsukiPetWait = Math.max(0, Math.min(s.natsukiPetWaitTicks, Math.round(opts.natsukiPetWait ?? 0)));
    e.natsukiDecayLeft = Math.max(1, Math.min(s.natsukiDecayTicks, Math.round(opts.natsukiDecayLeft ?? s.natsukiDecayTicks)));
  }
  if (coop) makeKid(core, e, coop);
  core.ents.push(e);
  core.push({ type: 'spawn', id: e.id, x, y, z });
  return e.id;
}

/** 出す の を 1 回 ためす（§2.1）。出た id か null */
export function trySpawn(core: LifeCtx): number | null {
  const s = core.settings;
  if (core.d.phase() !== 'day') return null;
  const p = core.getPlayer().position;
  let wild = 0;
  for (const e of core.ents) if (!e.friend && dist2d(e.x, e.z, p.x, p.z) <= s.animalRemoveDist) wild++;
  if (wild >= s.animalWildMax) return null;
  for (let i = 0; i < 20; i++) {
    const ang = core.rng() * TAU;
    const r = s.animalSpawnMinDist + core.rng() * (s.animalSpawnMaxDist - s.animalSpawnMinDist);
    const ix = Math.floor(p.x + Math.cos(ang) * r);
    const iz = Math.floor(p.z + Math.sin(ang) * r);
    const cx = ix + 0.5;
    const cz = iz + 0.5;
    const dd = dist2d(cx, cz, p.x, p.z);
    if (dd < s.animalSpawnMinDist || dd > s.animalSpawnMaxDist) continue;
    if (!core.world.isLoaded(ix, iz) || !bodyInWall(cx, cz, BODY.radius, 1)) continue;
    const k = core.d.countryAt(core.d.seed, cx, cz).kind;
    if (k !== 'harappa' && k !== 'hana') continue;
    if (inFootprintAny(core.coopList, cx, cz)) continue;
    const sy = surfaceY(core.world, ix, iz);
    if (sy === null || core.world.getBlock(ix, sy, iz) !== 'grass') continue;
    if (clear2(core, ix, sy + 1, iz) === false) continue;
    const e = core.make(cx, sy + 1, cz, false, 0, 0);
    e.lock = APPEAR_TICKS;
    e.lockKind = 'appear';
    e.state = 'appear';
    core.ents.push(e);
    core.push({ type: 'spawn', id: e.id, x: cx, y: sy + 1, z: cz });
    return e.id;
  }
  return null;
}

export function updateAnimals(core: LifeCtx): void {
  const s = core.settings;
  core.tick++;
  for (let i = core.catches.length - 1; i >= 0; i--) {
    if (--core.catches[i]! > 0) continue;
    core.catches.splice(i, 1);
    core.push({ type: 'bugCatch', toInventory: core.d.addItem('mushi') });
  }
  if (s.animalAutoSpawn) {
    core.spawnTimer++;
    if (core.spawnTimer >= s.animalSpawnInterval) {
      core.spawnTimer = 0;
      trySpawn(core);
    }
  }
  const p = core.getPlayer().position;
  core.night = core.d.phase() === 'night';
  core.fighterIds = pickFightersNow(core);
  checkMorning(core);
  for (const c of core.coopList) if (c.meat) meatTick(core, c);
  for (let i = core.ents.length - 1; i >= 0; i--) {
    const e = core.ents[i]!;
    if (e.friend && e.stage === 'adult') natsukiTick(core, e);
    if (!stepAnimal(core, e, p)) core.ents.splice(i, 1);
  }
  // かさならない: すわっている なかま を はなす（小屋 の 子 は 中 3×3 だけ なので はなさない）
  for (const e of core.ents) if (e.friend && e.home === null && !e.following && !e.carried && !e.flight && !e.glide && e.lock === 0 && e.fs === 'none') separateFriend(core, e, p);
  if (core.kitList.length > 0) updateKits(core, p);
  if (core.coopList.length > 0 && ++core.coopCheckT >= COOP_CHECK_EVERY) {
    core.coopCheckT = 0;
    checkCoopBlocks(core);
  }
}

/** 1 ステップ ぶん。消えた なら false */
function stepAnimal(core: LifeCtx, e: Ent, p: Vec3): boolean {
  const s = core.settings;
  if (e.bangLeft > 0) e.bangLeft--;
  // LIVE-4: たたかえる 子 で なく なった（だっこ・なげ・いただきます・パタパタ・順番 など）→ ねらい を やめる
  if (e.fs !== 'none' && !core.fighterIds.includes(e.id)) fightStop(core, e, 'stop');
  e.stateTicks++;
  if (e.fullLeft > 0) e.fullLeft--;
  if (e.popAge >= 0 && e.popAge < POP_TICKS) e.popAge++;
  if (e.meat) {
    meatBird(core, e);
    return true;
  }
  if (e.carried) {
    // だっこ 中: プレイヤー の 足もと に いる。follow は へらない
    e.x = p.x;
    e.y = p.y;
    e.z = p.z;
    e.vy = 0;
    e.fluttering = false;
    e.inWater = false;
    e.enterT = 0;
    e.airFrom = -1;
    core.setState(e, 'carried');
    // LIVE-2.1: もちあげ 10 ステップ で 手 から はなれる／そっと おろす 20 ステップ
    if (e.liftLeft > 0 && --e.liftLeft === 0) releaseThrow(core, e, p);
    else if (e.putLeft > 0 && --e.putLeft === 0) finishSoftPut(core, e);
    return true;
  }
  if (e.flight) {
    flightStep(core, e, p);
    return true;
  }
  if (e.glide) {
    glideStep(core, e);
    return true;
  }
  if (e.rollLeft > 0) e.rollLeft--;
  const d = dist2d(e.x, e.z, p.x, p.z);

  if (!e.friend) {
    if (d > (e.hearts >= 1 ? Math.max(s.animalRemoveDist, HEART_REMOVE_DIST) : s.animalRemoveDist)) return removeAnimal(core, e, 'far');
    if (e.y < -10) return removeAnimal(core, e, 'void');
  }
  const loaded = core.world.isLoaded(Math.floor(e.x), Math.floor(e.z));
  if (!loaded) {
    if (e.friend && e.home === null) friendWarpChecks(core, e, p, d, true);
    return true;
  }
  // うまった
  if (core.world.isSolid(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z))) {
    if (!unbury(core, e)) {
      if (e.home !== null) kidRespawn(core, e, p);
      else if (!e.friend) return removeAnimal(core, e, 'buried');
      else if (warpToPlayer(core, e, p)) return true;
      else e.warpWait = 60;
    }
  }
  // かえる 動き の あいだ は ついてくる 時間 を へらさず、ワープ も しない（かえった とき まんたん）
  const hatching = e.lock > 0 && e.lockKind === 'hatch';
  if (e.home !== null) kidKeepInside(core, e);
  else if (e.friend && !hatching && friendWarpChecks(core, e, p, d, false)) return true;
  if (e.friend && e.follow > 0 && !hatching && --e.follow === 0) endFollow(core, e);

  if (e.lock > 0) {
    e.lock--;
    if (e.lock === 0) finishLock(core, e);
    else core.setState(e, core.lockState(e));
  }
  if (e.lock === 0) {
    if (e.home !== null && core.night) sleepKid(core, e);
    else if (e.fs !== 'none') fightStep(core, e, p, d);
    else behaveAnimal(core, e, p, d);
  }
  if (e.home !== null) {
    if (e.lock === 0) growCheck(core, e, p);
  } else if (e.friend) enterCheck(core, e);

  if (!e.walking) unstraddle(core, e);
  settleOnGround(core, e);
  turnAnimal(core, e, p, d);
  return true;
}

/** ついてくる 時間 が 0 に なった（§2.7）: その場 に とまり、そこ を 中心 に のんびり */
function endFollow(core: LifeCtx, e: Ent): void {
  if (e.fs !== 'none') fightStop(core, e, 'stop');
  e.following = false;
  e.bestDist = Infinity;
  e.stuck = 0;
  e.warpWait = 0;
  e.homeX = e.x;
  e.homeZ = e.z;
  e.walking = false;
  e.restLeft = 20 + Math.floor(core.rng() * 40);
  if (e.lock === 0) core.setState(e, 'rest');
  core.push({ type: 'followEnd', id: e.id });
}

function removeAnimal(core: LifeCtx, e: Ent, reason: 'far' | 'void' | 'buried'): false {
  core.push({ type: 'remove', id: e.id, reason });
  return false;
}

function finishLock(core: LifeCtx, e: Ent): void {
  const kind = e.lockKind;
  if (e.egg) {
    e.egg = false;
    layEgg(core, e);
  }
  if (kind === 'hatch') {
    // かえった: すぐ なかま・ついてくる 時間 まんたん（§2.1）
    e.follow = core.settings.animalFollowTicks;
    const firstHatch = core.d.hatchedBefore ? !core.d.hatchedBefore() : !core.everHatched;
    core.everHatched = true;
    core.push({ type: 'hatch', id: e.id, breed: e.breed, gold: e.fromGold, first: firstHatch });
  } else if (kind === 'grow') {
    const first = core.d.grewBefore ? !core.d.grewBefore() : !core.everGrew;
    core.everGrew = true;
    e.stage = 'adult';
    e.raised = true;
    e.grow = 0;
    e.natsuki = 0;
    e.natsukiBugWait = 0;
    e.natsukiPetWait = 0;
    e.natsukiDecayLeft = core.settings.natsukiDecayTicks;
    core.push({ type: 'grow', id: e.id, first, breed: e.breed });
  }
  if (e.becomeFriend && core.friendCount() < core.settings.animalFriendMax) {
    e.becomeFriend = false;
    e.friend = true;
    e.joinNo = ++core.joinSeq;
    e.stopOff = core.nextStopOff();
    e.hearts = 0;
    e.eggMiss = 0;
    e.natsuki = 0;
    e.natsukiBugWait = 0;
    e.natsukiPetWait = 0;
    e.natsukiDecayLeft = core.settings.natsukiDecayTicks;
    e.follow = core.settings.animalFollowTicks;
    e.following = false;
    const count = core.friendCount();
    const first = count === 1;
    core.push({ type: 'friend', id: e.id, first, count });
    core.setLock(e, 'cheer', first ? 40 : 20);
    return;
  }
  e.becomeFriend = false;
  core.setState(e, restState(e));
  // お祝い が おわった: まだ だっこ を して いない なら ながおし の ヒント（§2.6）
  if (kind === 'cheer' && e.home === null) {
    const done = core.d.carriedBefore ? core.d.carriedBefore() : core.everCarried;
    if (!done) core.push({ type: 'carryHint' });
  }
}

function restState(e: Ent): AnimalState {
  return e.friend && e.follow > 0 ? 'idle' : 'rest';
}
