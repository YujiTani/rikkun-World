/** 保存（SaveExtra。LIVE-2.1 §4.3・v 4） */
import type { AnimalCore } from './animalCore';
import type { AnimalBirdSave, AnimalSaveV4 } from '../contracts';
import { inInterior } from './coop';
import { parseAnimalSave, type ParsedBird } from './saveV3';
import type { Coop, Ent } from './animalTypes';
import { BLOCK_NUKUNUKU } from './animalConsts';
import { round2 } from './animalMath';
import { makeKid } from './animalCoops';

/** この 係 が 使う ものだけ（`AnimalCore` の 一部） */
type SaveCtx = Pick<AnimalCore, 'breedState' | 'clear' | 'coopAtSpot' | 'coopById' | 'coopList' | 'd' | 'dropGold' | 'ents' | 'find' | 'getPlayer' | 'goldRng' | 'hintOut' | 'kidCount' | 'kitList' | 'lastDay' | 'lockHintAt' | 'make' | 'nextCoopId' | 'push' | 'rng' | 'setLock' | 'setState' | 'settings' | 'targetId' | 'tick' | 'tryAdd' | 'world'>;

/**
 * 保存（LIVE-2.1 §4.3・v 4）。だっこ 中 は プレイヤー の 足もと の 位置 が そのまま 入る。なげて いる とちゅう は 着地点 に いる もの と して 書く
 * （小屋 の 中 なら 小屋 の 子）。かえる 動き 中 の ひよこ は こたつ に 戻して 入れる（読み直す と また かえる）
 */
export function serializeAnimals(core: SaveCtx): AnimalSaveV4 {
  const where = (e: Ent): { x: number; y: number; z: number; home: number | null } => {
    if (e.flight) {
      const f = e.flight;
      const into = core.coopAtSpot({ x: f.tx, y: f.ty, z: f.tz });
      return { x: f.tx, y: f.ty, z: f.tz, home: into && core.kidCount(into.id, e) < core.settings.coopMax ? into.id : null };
    }
    if (e.glide) {
      const into = core.coopAtSpot({ x: e.glide.x, y: e.y, z: e.glide.z });
      return { x: e.glide.x, y: e.y, z: e.glide.z, home: into ? into.id : null };
    }
    return { x: e.x, y: e.y, z: e.z, home: e.home };
  };
  // 保存 の 大きさ（4,000 文字 以下）の ため、0・false の 項目 は 書かない（読む とき は 無ければ 0・false）
  const bird = (e: Ent, at: { x: number; y: number; z: number; home: number | null }): AnimalBirdSave => {
    const b: AnimalBirdSave = {
      x: round2(at.x),
      y: round2(at.y),
      z: round2(at.z),
      yaw: round2(e.yaw),
      follow: at.home !== null ? 0 : Math.round(e.follow),
      stage: e.stage,
      breed: e.breed,
    };
    if (e.raised) b.raised = true;
    if (e.bugs > 0) b.bugs = e.bugs;
    if (e.goldMiss > 0) b.goldMiss = e.goldMiss;
    if (e.grow > 0) b.grow = e.grow;
    if (e.natsuki > 0) b.natsuki = e.natsuki;
    if (e.natsukiBugWait > 0) b.natsukiBugWait = e.natsukiBugWait;
    if (e.natsukiPetWait > 0) b.natsukiPetWait = e.natsukiPetWait;
    // へる まで の のこり は なつき度 が 0 なら 意味 が ない ので 書かない（読む とき は まんたん）
    if (e.natsuki > 0 && e.natsukiDecayLeft !== core.settings.natsukiDecayTicks) b.natsukiDecayLeft = e.natsukiDecayLeft;
    return b;
  };
  const friends: AnimalBirdSave[] = [];
  const kidsOf = new Map<number, AnimalBirdSave[]>();
  for (const e of core.ents) {
    if (!e.friend) continue;
    const at = where(e);
    if (at.home !== null) {
      const list = kidsOf.get(at.home) ?? [];
      list.push(bird(e, at));
      kidsOf.set(at.home, list);
      continue;
    }
    if (e.lock > 0 && e.lockKind === 'hatch') continue;
    friends.push(bird(e, at));
  }
  const coops = core.coopList.map((c) => ({
    id: c.id,
    x: c.x,
    y: c.y,
    z: c.z,
    dir: c.dir,
    kids: kidsOf.get(c.id) ?? [],
    nest: { egg: c.egg, gold: c.gold },
  }));
  const kits = core.kitList.map((k) => ({ x: k.x, y: k.y, z: k.z, eggs: k.eggs.map((r) => ({ egg: r.egg, left: r === k.hatch ? 0 : r.left })) }));
  return { v: 4, friends, coops, kits, machoMiss: core.breedState.machoMiss };
}

/** 読みこみ。版 1（`eggDay` つき・`follow` なし）→ 版 2 → 版 3 の 順 に 直す（台帳 G8） */
export function deserializeAnimals(core: SaveCtx, data: unknown): void {
  core.clear();
  resetLive(core);
  const s = core.settings;
  const p = parseAnimalSave(data, {
    followMax: s.animalFollowTicks,
    friendMax: s.animalFriendMax,
    coopMax: s.coopMax,
    coopCountMax: s.coopCountMax,
    kitMax: s.kitActiveMax,
    kitEggMax: s.kitEggMax,
    natsukiMax: s.natsukiMax,
    bugWaitMax: s.natsukiBugWaitTicks,
    petWaitMax: s.natsukiPetWaitTicks,
    decayMax: s.natsukiDecayTicks,
  });
  if (!p) return;
  for (const b of p.friends) {
    const e = core.make(b.x, b.y, b.z, true, 0, b.follow);
    applyBird(e, b);
    core.ents.push(e);
  }
  for (const r of p.coops) {
    let id = r.id;
    if (id === null || id < 1 || core.coopList.some((c) => c.id === id)) id = Math.max(core.nextCoopId, ...core.coopList.map((c) => c.id + 1));
    const c: Coop = { id, x: r.x, y: r.y, z: r.z, dir: r.dir, egg: r.egg, gold: r.gold, meat: null };
    if (c.egg + c.gold > s.coopNestMax) {
      c.gold = Math.min(c.gold, s.coopNestMax);
      c.egg = Math.max(0, s.coopNestMax - c.gold);
    }
    core.coopList.push(c);
    core.nextCoopId = Math.max(core.nextCoopId, id + 1);
    for (const b of r.kids) {
      const inside = inInterior(c, b.x, b.z, 0);
      const e = core.make(inside ? b.x : c.x + 0.5, inside ? b.y : c.y, inside ? b.z : c.z + 0.5, true, 0, 0);
      applyBird(e, b);
      makeKid(core, e, c);
      core.ents.push(e);
    }
  }
  for (const k of p.kits) {
    // こたつ の ブロック が 無い 行 は すてる（読みこんで いない 所 は あとで 見る）
    if (core.world.isLoaded(k.x, k.z) && String(core.world.getBlock(k.x, k.y, k.z)) !== BLOCK_NUKUNUKU) continue;
    const total = Math.max(1, Math.round(s.kitHatchTicks));
    const eggs = k.eggs.map((r) => ({ egg: r.egg, left: r.left, total: Math.max(total, r.left) }));
    core.kitList.push({ x: k.x, y: k.y, z: k.z, eggs, chick: 0, hatch: null, gap: 0, fullWait: 0, retry: 0 });
  }
  core.breedState.machoMiss = p.machoMiss;
}

function applyBird(e: Ent, b: ParsedBird): void {
  e.yaw = b.yaw;
  e.headYaw = b.yaw;
  e.stage = b.stage;
  e.breed = b.breed;
  e.raised = b.raised;
  e.bugs = b.bugs;
  e.goldMiss = b.goldMiss;
  e.grow = b.grow;
  e.natsuki = b.natsuki;
  e.natsukiBugWait = b.natsukiBugWait;
  e.natsukiPetWait = b.natsukiPetWait;
  e.natsukiDecayLeft = b.natsukiDecayLeft;
}

/** 小屋・こたつ・くじ を ぜんぶ 空 に する（読みこみ の まえ） */
function resetLive(core: SaveCtx): void {
  core.kitList = [];
  core.coopList = [];
  core.nextCoopId = 1;
  core.breedState.machoMiss = 0;
  core.lastDay = null;
}
