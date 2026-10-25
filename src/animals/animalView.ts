/** 描く 側・つなぎ込み へ 見せる もの（list・rayHit・forEachVisible） */
import type { AnimalCore } from './animalCore';
import type { AnimalInfo, AnimalView, Vec3 } from '../contracts';
import { aimBox, bodySize } from './size';
import type { Ent } from './animalTypes';
import { POP_TICKS, ROLL_TICKS, THROW_LIFT_TICKS } from './animalConsts';
import { dist2d, slab } from './animalMath';
import { meatDraw } from './animalMeat';

/** この 係 が 使う ものだけ（`AnimalCore` の 一部） */
type ViewCtx = Pick<AnimalCore, 'coopById' | 'coopList' | 'd' | 'ents' | 'find' | 'getPlayer' | 'push' | 'setState' | 'settings' | 'targetId' | 'tryAdd' | 'view' | 'world'>;

export function listAnimals(core: ViewCtx): AnimalInfo[] {
  const p = core.getPlayer().position;
  return core.ents.map((e) => ({
    id: e.id,
    kind: 'chicken' as const,
    x: e.x,
    y: e.y,
    z: e.z,
    yaw: e.yaw,
    friend: e.friend,
    hearts: e.hearts,
    state: e.state,
    lookingAtPlayer: lookingAt(core, e, p),
    inWater: e.inWater,
    follow: e.follow,
    fullLeft: e.fullLeft,
    carried: e.carried,
    fluttering: e.fluttering,
    vy: e.vy,
    stage: e.stage,
    breed: e.breed,
    home: e.home,
    raised: e.raised,
    bugs: e.bugs,
    goldMiss: e.goldMiss,
    grow: e.grow,
    size: bodySize(e.stage, e.breed),
    target: e.target,
    hits: e.hits,
    natsuki: e.natsuki,
    natsukiBugWait: e.natsukiBugWait,
    natsukiPetWait: e.natsukiPetWait,
    natsukiDecayLeft: e.natsukiDecayLeft,
  }));
}

export function rayHitAnimal(core: ViewCtx, origin: Vec3, dir: Vec3, maxDist: number): { id: number; distance: number } | null {
  let bestId = -1;
  let bestT = Infinity;
  for (const e of core.ents) {
    if (e.state === 'appear' || e.carried || e.flight || e.meat) continue;
    const box = aimBox(e.stage, e.breed);
    const hw = box.hw;
    const t = slab(origin.x, dir.x, e.x - hw, e.x + hw, 0, maxDist);
    if (t === null) continue;
    const ty = slab(origin.y, dir.y, e.y, e.y + box.h, t[0], t[1]);
    if (ty === null) continue;
    const tz = slab(origin.z, dir.z, e.z - hw, e.z + hw, ty[0], ty[1]);
    if (tz === null) continue;
    if (tz[0] <= maxDist && tz[0] < bestT) {
      bestT = tz[0];
      bestId = e.id;
    }
  }
  if (bestId < 0) return null;
  return { id: bestId, distance: bestT };
}

export function forEachVisibleAnimal(core: ViewCtx, fn: (v: AnimalView) => void): void {
  const v = core.view;
  for (const e of core.ents) {
    v.id = e.id;
    v.x = e.x;
    v.y = e.y;
    v.z = e.z;
    v.yaw = e.yaw;
    v.headYaw = e.headYaw;
    v.state = e.state;
    v.stateTicks = e.stateTicks;
    v.friend = e.friend;
    v.hearts = e.hearts;
    v.targeted = e.id === core.targetId;
    v.follow = e.home !== null ? 0 : e.follow;
    v.fullLeft = e.fullLeft;
    v.carried = e.carried;
    v.fluttering = e.fluttering;
    v.stage = e.stage;
    v.breed = e.breed;
    v.home = e.home;
    v.homeFill = e.home === null && e.enterT > 0 ? Math.min(1, e.enterT / Math.max(1, core.settings.coopEnterTicks)) : undefined;
    v.hatchT = e.lock > 0 && e.lockKind === 'hatch' ? 1 - e.lock / Math.max(1, e.lockTotal) : undefined;
    v.growT = e.lock > 0 && e.lockKind === 'grow' ? 1 - e.lock / Math.max(1, e.lockTotal) : undefined;
    v.rollT = e.rollLeft > 0 ? 1 - e.rollLeft / ROLL_TICKS : undefined;
    v.homePop = e.popAge >= 0 && e.popAge < POP_TICKS ? 1 - e.popAge / POP_TICKS : 0;
    v.liftT = e.liftLeft > 0 ? 1 - e.liftLeft / THROW_LIFT_TICKS : undefined;
    v.thrown = e.flight !== null;
    v.fight = e.fs !== 'none' ? true : undefined;
    v.bang = e.bangLeft > 0 ? true : undefined;
    v.target = e.target ?? undefined;
    if (e.meat) meatDraw(core, e, v);
    fn(v);
  }
}

function lookingAt(core: ViewCtx, e: Ent, p: Vec3): boolean {
  if (e.lock > 0 || e.state === 'appear') return false;
  return (e.friend && e.follow > 0 ? e.state === 'idle' : e.look) && dist2d(e.x, e.z, p.x, p.z) <= core.settings.animalLookDist;
}
