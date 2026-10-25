/** えさ・なでる・なつき度（GOLD-1） */
import type { AnimalCore } from './animalCore';
import type { ItemId, ItemStack, NatsukiView } from '../contracts';
import { rollPity } from './lottery';
import type { Ent } from './animalTypes';
import { FULL_REACT_TICKS, NATSUKI_HINT_GAP } from './animalConsts';

/** この 係 が 使う ものだけ（`AnimalCore` の 一部） */
type CareCtx = Pick<AnimalCore, 'eggRng' | 'ents' | 'find' | 'friendCount' | 'hintOut' | 'push' | 'setLock' | 'settings' | 'targetId' | 'tick' | 'waitHintAt'>;

/** GOLD-1: なつき度 を もつ 子（なかま の 大人。ふつう・マッチョ どちら も。小屋 の 子 も） */
function hasNatsuki(e: Ent): boolean {
  return e.friend && e.stage === 'adult';
}

export function previewAnimal(core: CareCtx, id: number, held: ItemStack | null): 'feed' | 'animalFull' | 'animalPet' | null {
  const e = core.find(id);
  if (!e || e.carried || e.meat) return null;
  // まち中 の むし は ロック中 でも「まってね」を 返す（feed と おなじ）
  if (e.lock > 0 && held && held.item === 'harapan_mimizu' && hasNatsuki(e) && e.state !== 'sleep') return 'feed';
  if (e.lock > 0) return held && held.item === 'mushi' && e.state !== 'sleep' && hasNatsuki(e) && e.natsukiBugWait > 0 ? 'animalFull' : null;
  const nat = hasNatsuki(e);
  if (held && held.item === 'mushi') {
    if (e.state === 'sleep') return 'animalPet';
    // GOLD-1: なかま の 大人 は むし の まち中 は あげられない（まってね）。おなかいっぱい（600）は まち の ほう が 長い ので 目立たない
    if (nat && e.natsukiBugWait > 0) return 'animalFull';
    return e.fullLeft > 0 ? 'animalFull' : 'feed';
  }
  // はらぱんみみず: なかま の 大人（ねて いない）に あげる。ほか は なでる の まま（右クリック で 合図 だけ 出す）
  if (held && held.item === 'harapan_mimizu') return nat && e.state !== 'sleep' ? 'feed' : 'animalPet';
  if (nat && e.natsukiPetWait > 0 && e.state !== 'sleep') return 'animalFull';
  return 'animalPet';
}

/** 合図 natsukiWait は 600 ステップ に 1 回 まで。出来事 natsukiWait と こっち を 見て くび を かしげる は 毎回 */
function waitReact(core: CareCtx, e: Ent, which: 'bug' | 'pet'): void {
  core.push({ type: 'natsukiWait', id: e.id, which });
  if (core.tick - core.waitHintAt >= NATSUKI_HINT_GAP) {
    core.waitHintAt = core.tick;
    core.hintOut('natsukiWait');
  }
  core.setLock(e, 'full', FULL_REACT_TICKS);
}

/** なつき度 を ふやす（上限 natsukiMax）。70 以下 → 71 以上 に なったら 出来事 natsukiGold */
function addNatsuki(core: CareCtx, e: Ent, n: number): void {
  const s = core.settings;
  const before = e.natsuki;
  e.natsuki = Math.max(0, Math.min(s.natsukiMax, before + n));
  if (before <= s.natsukiGoldMin && e.natsuki > s.natsukiGoldMin) core.push({ type: 'natsukiGold', id: e.id });
}

export function feedAnimal(core: CareCtx, id: number, item: ItemId): 'ate' | 'full' | 'pet' | 'friendFull' | 'sleep' | 'wait' | 'harapan' | 'harapanNo' | null {
  const e = core.find(id);
  if (!e || e.carried || e.meat) return null;
  // まち中 の 合図 は 動きの 最中（ロック中）でも 返す（くび を かしげる は つづけて 出さない）
  if (e.lock > 0 && item === 'mushi' && e.state !== 'sleep' && hasNatsuki(e) && e.natsukiBugWait > 0) {
    core.push({ type: 'natsukiWait', id: e.id, which: 'bug' });
    if (core.tick - core.waitHintAt >= NATSUKI_HINT_GAP) {
      core.waitHintAt = core.tick;
      core.hintOut('natsukiWait');
    }
    return 'wait';
  }
  // はらぱんみみず は 前 の 動き の 最中 でも あげられる（なかま の 大人 だけ）
  if (e.lock > 0 && !(item === 'harapan_mimizu' && hasNatsuki(e))) return null;
  if (item === 'harapan_mimizu') return feedHarapan(core, e);
  if (item !== 'mushi') return null;
  const s = core.settings;
  // ねて いる 子: たべない（むし は へらない）。あさ に あげよう（§2.7）
  if (e.state === 'sleep') {
    core.hintOut('sleepHint');
    return 'sleep';
  }
  // GOLD-1 §4.4: まち中 は あげられない（むし は のこる・くじ も bugs も ふえない）
  if (hasNatsuki(e) && e.natsukiBugWait > 0) {
    waitReact(core, e, 'bug');
    return 'wait';
  }
  if (e.fullLeft > 0) {
    core.push({ type: 'full', id });
    core.setLock(e, 'full', FULL_REACT_TICKS);
    return 'full';
  }
  if (!e.friend && e.hearts >= 2 && core.friendCount() + pendingFriends(core) >= s.animalFriendMax) {
    core.hintOut('friendFull');
    return 'friendFull';
  }
  e.fullLeft = s.animalFullTicks;
  e.bugs++;
  if (e.friend) {
    // ついてくる 時間 が まんたん に もどる（とまって いた なかま も また ついてくる）。小屋 の 子 は ついてこない
    if (e.home === null) {
      e.follow = s.animalFollowTicks;
      e.walking = false;
      e.stuck = 0;
    }
    core.push({ type: 'feed', id, item, hearts: 0, friend: true });
    if (hasNatsuki(e)) {
      addNatsuki(core, e, s.natsukiBug);
      e.natsukiBugWait = s.natsukiBugWaitTicks;
    }
    // ひよこ は たまご を うまない（§2.2）
    const roll = e.stage === 'chick' ? { hit: false, misses: e.eggMiss } : rollPity(core.eggRng, s.animalEggChance, s.animalEggPity, e.eggMiss);
    e.eggMiss = roll.misses;
    if (roll.hit) {
      e.egg = true;
      core.setLock(e, 'eat', s.animalEggDelay);
    } else {
      core.setLock(e, 'eat', s.animalReactTicks);
    }
    return 'ate';
  }
  if (e.hearts >= 2) {
    e.becomeFriend = true;
    core.push({ type: 'feed', id, item, hearts: 3, friend: false });
  } else {
    e.hearts = (e.hearts + 1) as 1 | 2;
    core.push({ type: 'feed', id, item, hearts: e.hearts, friend: false });
  }
  core.setLock(e, 'eat', s.animalReactTicks);
  return 'ate';
}

/** はらぱんみみず（§4.6）: なかま の 大人 に あげる と なかよし 100。ほか は へらさない（合図） */
function feedHarapan(core: CareCtx, e: Ent): 'harapan' | 'harapanNo' {
  if (e.state === 'sleep') {
    core.hintOut('sleepHint');
    return 'harapanNo';
  }
  if (!hasNatsuki(e)) {
    // やせい は 今 の「なでる」の 返し（見る・くび を かしげる）。ひよこ は じっと
    if (!e.friend) {
      core.push({ type: 'pet', id: e.id, friend: false });
      core.setLock(e, 'pet', core.settings.animalReactTicks);
    }
    core.hintOut('harapanFriend');
    return 'harapanNo';
  }
  if (e.natsuki >= core.settings.natsukiMax) {
    core.hintOut('harapanFull');
    core.setLock(e, 'full', FULL_REACT_TICKS);
    return 'harapanNo';
  }
  addNatsuki(core, e, core.settings.natsukiMax);
  core.push({ type: 'harapanFeed', id: e.id });
  // お祝い: 金 の たまご を うんだ ときの「2 回 ジャンプ」（LIVE-2 §2.8）を 使い回す
  core.setLock(e, 'cheer', 40);
  return 'harapan';
}

/** パネル の 状態（§3.2・§6）。なかま の 大人 だけ shown（だっこ 中 は 出ない） */
export function natsukiViewOf(core: CareCtx, id: number): NatsukiView | null {
  const e = core.find(id);
  if (!e) return null;
  const s = core.settings;
  const shown = hasNatsuki(e) && !e.carried && e.flight === null;
  const bw = Math.max(1, s.natsukiBugWaitTicks);
  const pw = Math.max(1, s.natsukiPetWaitTicks);
  return {
    shown,
    hearts: Math.min(10, Math.floor((e.natsuki * 10) / Math.max(1, s.natsukiMax))),
    gold: e.natsuki > s.natsukiGoldMin,
    bugReady: e.natsukiBugWait <= 0,
    petReady: e.natsukiPetWait <= 0,
    bugFill: e.natsukiBugWait <= 0 ? 1 : 1 - Math.min(1, e.natsukiBugWait / bw),
    petFill: e.natsukiPetWait <= 0 ? 1 : 1 - Math.min(1, e.natsukiPetWait / pw),
  };
}

/** 3 つ目 の やさい を たべて ロック中 の（まもなく なかま に なる）数 */
function pendingFriends(core: CareCtx): number {
  let n = 0;
  for (const e of core.ents) if (e.becomeFriend) n++;
  return n;
}

export function petAnimal(core: CareCtx, id: number): 'wild' | 'friend' | 'wait' | null {
  const e = core.find(id);
  if (!e || e.lock > 0 || e.carried || e.meat) return null;
  if (!e.friend) {
    core.push({ type: 'pet', id, friend: false });
    core.hintOut('feedHint');
    core.setLock(e, 'pet', core.settings.animalReactTicks);
    return 'wild';
  }
  if (hasNatsuki(e)) {
    // GOLD-1 §4.4: なでる の まち中 は なでられない（ねて いる 子 も おなじ）
    if (e.natsukiPetWait > 0) {
      waitReact(core, e, 'pet');
      return 'wait';
    }
    addNatsuki(core, e, core.settings.natsukiPet);
    e.natsukiPetWait = core.settings.natsukiPetWaitTicks;
  }
  core.push({ type: 'pet', id, friend: true });
  core.setLock(e, 'pet', core.settings.animalReactTicks);
  return 'friend';
}

/** GOLD-1: なつき度 の 時間（まち が へる・10 分 ごと に へる）。はなれて いても・ねて いても 世界 の 時計 で すすむ。へる が 先 */
export function natsukiTick(core: CareCtx, e: Ent): void {
  const s = core.settings;
  // なつき度 0 の 間 は へる もの が 無い ので 時計 は 止める（はじめて 上がった とき から 数える）
  if (e.natsuki > 0 && --e.natsukiDecayLeft <= 0) {
    e.natsuki = Math.max(0, e.natsuki - s.natsukiDecay);
    e.natsukiDecayLeft = s.natsukiDecayTicks;
  }
  if (e.natsukiBugWait > 0 && --e.natsukiBugWait === 0 && e.id === core.targetId) core.push({ type: 'natsukiReady', id: e.id, which: 'bug' });
  if (e.natsukiPetWait > 0 && --e.natsukiPetWait === 0 && e.id === core.targetId) core.push({ type: 'natsukiReady', id: e.id, which: 'pet' });
}
