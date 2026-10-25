/** LIVE-4 マッチョ と いっしょ に たたかう（docs/design/LIVE-4.md 版 2.1） */
import type { AnimalCore } from './animalCore';
import type { FightCues, MachoGiveUpReason, Vec3 } from '../contracts';
import { BODY } from './terrain';
import { FIGHT, inReach, isUpperPunch, pickFighters, punchDamage, punchPlan, resolveCue } from './fight';
import type { Ent } from './animalTypes';
import { DT, NO_FIGHT, ZERO_KNOCK } from './animalConsts';
import { dist2d, FOLLOW_OFFS, yawTo } from './animalMath';
import { behaveAnimal, followPlayer, tryMove } from './animalMove';

/** この 係 が 使う ものだけ（`AnimalCore` の 一部） */
type FightCtx = Pick<AnimalCore, 'bangBuf' | 'coopById' | 'coopList' | 'd' | 'ents' | 'fightCands' | 'find' | 'getPlayer' | 'markOut' | 'oneFighter' | 'push' | 'rng' | 'setState' | 'settings' | 'world'>;

/** たたかえる マッチョ か（§2.1。ひよこ・ふつう の にわとり・とりごや の 子・だっこ／なげ／パタパタ／いただきます 中 は 入らない） */
function canFight(e: Ent): boolean {
  return e.friend && e.home === null && e.stage === 'adult' && e.breed === 'macho' && e.follow > 0 && !e.carried && !e.flight && !e.glide && !e.meat && !(e.fluttering && e.airFrom - e.y > FIGHT.flutterDrop);
}

/** たたかう 子 の id（なかま に なった 順 に `machoFighters` わ まで）。毎 ステップ の はじめ に 1 回 */
export function pickFightersNow(core: FightCtx): number[] {
  if (core.d.fight?.playerDead?.()) return NO_FIGHT; // りっくん が たおれた: たたかいを やめる（'stop'）
  const max = core.settings.machoFighters;
  if (max === 1) {
    // 1 わ だけ: 並べかえ せず に いちばん 早い 子（joinNo、同じ なら id）を さがす
    let best: Ent | null = null;
    for (const e of core.ents) {
      if (e.joinNo > 0 && canFight(e) && (best === null || e.joinNo < best.joinNo || (e.joinNo === best.joinNo && e.id < best.id))) best = e;
    }
    if (best === null) return NO_FIGHT;
    core.oneFighter[0] = best.id;
    return core.oneFighter;
  }
  const c = core.fightCands;
  c.length = 0;
  for (const e of core.ents) if (e.joinNo > 0 && canFight(e)) c.push({ id: e.id, joinNo: e.joinNo });
  return c.length === 0 ? NO_FIGHT : pickFighters(c, core.settings.machoFighters);
}

/** 窓口: いま たたかえる マッチョ の id（その場 で 数え直す。だっこ した 次 の 子 も すぐ 見える） */
export function fightersNow(core: FightCtx): number[] {
  const ids = pickFightersNow(core);
  return ids === NO_FIGHT ? [] : [...ids];
}

/**
 * 「きっかけ」を 渡す（§2.2）。りっくん が 体力 を へらした 妖怪（`hit`）・りっくん の 体力 を へらした 妖怪（`hurt`）。
 * 12 マス（`machoLeash`）より とおい 妖怪・もう いない 妖怪 は 数えない。たたかう 子 だけ が その ステップ に ねらう
 */
export function fightCue(core: FightCtx, c: FightCues): void {
  const port = core.d.fight;
  if (!port || (c.hit.length === 0 && c.hurt.length === 0)) return;
  const ids = fightersNow(core);
  if (ids.length === 0) return;
  const p = core.getPlayer().position;
  const leash = core.settings.machoLeash;
  const ok = (id: number): boolean => {
    const y = port.yokai(id);
    return y !== null && y.state === 'alive' && dist2d(y.x, y.z, p.x, p.z) <= leash;
  };
  const cue = resolveCue(c.hit.filter(ok), c.hurt.filter(ok));
  if (!cue) return;
  for (const id of ids) {
    const e = core.find(id);
    if (!e) continue;
    e.forgetLeft = core.settings.machoForget;
    if (e.target === cue.yokai) continue;
    e.target = cue.yokai;
    e.hits = 0;
    e.fs = 'run';
    e.ft = -1;
    e.flexLeft = 0;
    e.bangLeft = FIGHT.bangTicks;
    core.push({ type: 'machoTarget', id, yokai: cue.yokai, cause: cue.cause });
  }
}

/** 画面 の しるし 用: 「！」 を 出す マッチョ の 足もと と 経過、ねらわれて いる 妖怪 の id（同時 に 1 つ まで） */
export function fightMarks(core: FightCtx): { bang: { x: number; y: number; z: number; age: number } | null; target: number | null } {
  const o = core.markOut;
  o.bang = null;
  o.target = null;
  for (const e of core.ents) {
    if (e.bangLeft > 0 && o.bang === null) {
      const b = core.bangBuf;
      b.x = e.x;
      b.y = e.y;
      b.z = e.z;
      b.age = FIGHT.bangTicks - e.bangLeft;
      o.bang = b;
    }
    if (e.target !== null && o.target === null) o.target = e.target;
  }
  return o;
}

/** ねらい を やめる（かちポーズ は 別）。ふつう の ついてくる に もどる */
export function fightStop(core: FightCtx, e: Ent, reason: MachoGiveUpReason): void {
  if (e.target !== null) core.push({ type: 'machoGiveUp', id: e.id, reason });
  e.target = null;
  e.hits = 0;
  e.fs = 'none';
  e.ft = 0;
  e.flexLeft = 0;
  e.forgetLeft = 0;
}

/** たおれた: かちポーズ（30 ステップ）。マッチョ の パンチ で たおした なら `ko` */
function fightDefeat(core: FightCtx, e: Ent, ko: boolean): void {
  if (ko && e.target !== null) core.push({ type: 'machoKO', id: e.id, yokai: e.target });
  fightStop(core, e, 'defeat');
  e.fs = 'flex';
  e.flexLeft = FIGHT.flexTicks;
  e.ft = 0;
  core.setState(e, 'flex');
  core.push({ type: 'machoFlex', id: e.id });
}

/** ねらい の ある あいだ の 1 ステップ（`fs` が 'none' でない とき の `behave` の かわり） */
export function fightStep(core: FightCtx, e: Ent, p: Vec3, d: number): void {
  const port = core.d.fight;
  if (!port) {
    fightStop(core, e, 'stop');
    behaveAnimal(core, e, p, d);
    return;
  }
  if (e.fs === 'flex') {
    e.ft++;
    if (--e.flexLeft > 0) {
      core.setState(e, 'flex');
      return;
    }
    e.fs = 'none';
    behaveAnimal(core, e, p, d);
    return;
  }
  const t = e.target === null ? null : port.yokai(e.target);
  let why: MachoGiveUpReason | null = null;
  if (t === null || t.state === 'leaving') why = 'gone';
  else if (t.state === 'dying') {
    fightDefeat(core, e, false);
    return;
  } else if (dist2d(t.x, t.z, p.x, p.z) > FIGHT.farDist) why = 'far';
  else if (--e.forgetLeft <= 0) why = 'forget';
  if (why !== null || t === null) {
    fightStop(core, e, why ?? 'gone');
    behaveAnimal(core, e, p, d);
    return;
  }
  e.walkYaw = yawTo(t.x - e.x, t.z - e.z);
  if (e.fs === 'punch') punchStep(core, e, t, p);
  else if (e.fs === 'cheer') cheerStep(core, e, t, p, d);
  else runStep(core, e, t);
}

function reachOf(core: FightCtx, e: Ent, t: { x: number; y: number; z: number; radius: number }, slack = 0): boolean {
  return inReach(dist2d(e.x, e.z, t.x, t.z), t.y - e.y, t.radius, core.settings.machoReach, slack);
}

/** はしる。とどいたら パンチ。180 ステップ とどかなければ おうえん */
function runStep(core: FightCtx, e: Ent, t: { x: number; y: number; z: number; radius: number }): void {
  const s = core.settings;
  e.ft++;
  core.setState(e, 'run');
  if (!reachOf(core, e, t)) {
    const dh = dist2d(e.x, e.z, t.x, t.z);
    // 横 に とどく のに 高さ が たりない（ちょうちん など）ときは その場 に 止まる
    const v = Math.min(s.machoRunSpeed * DT, Math.max(0, dh - Math.max(0, t.radius + s.machoReach - 0.05)));
    if (v > 0) {
      for (const off of FOLLOW_OFFS) {
        const a = e.walkYaw + off;
        if (tryMove(core, e, Math.sin(a) * v, -Math.cos(a) * v, BODY.wanderDrop, false)) break;
      }
    }
  }
  if (reachOf(core, e, t) && !(t as { sliding?: boolean }).sliding) {
    beginPunch(core, e);
    return;
  }
  if (e.ft >= FIGHT.cheerAfter) {
    e.fs = 'cheer';
    e.ft = 0;
    e.cheerX = t.x;
    e.cheerZ = t.z;
    core.setState(e, 'cheer');
  }
}

/** パンチ を はじめる（刀 の 突き の ため〈startup〉＋ 1 で 当たる。ながさ は 突き と 同じ）。きりあげ は 3 回 に 1 回 */
function beginPunch(core: FightCtx, e: Ent): void {
  const plan = punchPlan(core.d.fight!.blade().thrust);
  e.upper = isUpperPunch(e.hits);
  e.punchAt = plan.hitAt;
  e.punchLen = plan.total;
  e.fs = 'punch';
  e.ft = 0;
  core.setState(e, e.upper ? 'upper' : 'punch');
  e.stateTicks = 0;
}

function punchStep(core: FightCtx, e: Ent, t: { x: number; y: number; z: number; radius: number; height: number }, _p: Vec3): void {
  e.ft++;
  if (e.ft >= e.punchLen) {
    // つぎ の パンチ（まだ とどく なら すぐ、とどかなければ また はしる）
    e.fs = 'run';
    e.ft = -1;
    runStep(core, e, t);
    return;
  }
  core.setState(e, e.upper ? 'upper' : 'punch');
  e.stateTicks = e.ft;
  if (e.ft === e.punchAt) punchHit(core, e, t);
}

/** 当たる コマ: まだ とどいて いれば 妖怪 の 体力 を へらす（刀 の 切り上げ と 同じ 口。押す・うかす も）。からぶり は 何も しない */
function punchHit(core: FightCtx, e: Ent, t: { x: number; y: number; z: number; radius: number; height: number }): void {
  const port = core.d.fight!;
  if (e.target === null || !reachOf(core, e, t, FIGHT.hitSlack)) return;
  const b = port.blade();
  const amount = punchDamage(core.settings.machoAtk, e.upper, b.kiriageMul);
  const knock = e.upper ? { dist: b.kiriageKnock[0], up: b.kiriageKnock[1] } : ZERO_KNOCK;
  const dealt = port.hit(e.target, amount, { x: e.x, y: e.y, z: e.z }, knock);
  if (!(dealt > 0)) return;
  e.hits++;
  core.push({ type: 'machoPunch', id: e.id, yokai: e.target, hit: true, upper: e.upper, damage: dealt, x: t.x, y: t.y + t.height * 0.6, z: t.z });
  const after = port.yokai(e.target);
  if (after === null || after.state === 'dying') fightDefeat(core, e, true);
}

/** おうえん: プレイヤー の そば で 力こぶ。ねらい は のこす。妖怪 が とどく 所 に 来たら また たたく */
function cheerStep(core: FightCtx, e: Ent, t: { x: number; y: number; z: number; radius: number }, p: Vec3, d: number): void {
  e.ft++;
  if (reachOf(core, e, t) && !(t as { sliding?: boolean }).sliding) {
    beginPunch(core, e);
    return;
  }
  if (dist2d(t.x, t.z, e.cheerX, e.cheerZ) > 3) {
    e.fs = 'run';
    e.ft = -1;
    runStep(core, e, t);
    return;
  }
  if (d > core.settings.animalFollowStart) followPlayer(core, e, p, d);
  else core.setState(e, 'cheer');
}
