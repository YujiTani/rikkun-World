// COOP-1 5c（仕様 §3.7 (d)・§8）: 2P の ほる係の `m4.animals` に わたす 包み。
import type { AnimalApi } from '../contracts';
import type { AnimalManager } from '../animals/AnimalManager';

/**
 * にわとり・小屋・こたつは 世界に 1 つ（`AnimalManager` も 1 つ）。2P の 口を 通した 呼び出しだけ 最後に `who: 2` を つけて わたす。
 * 見るだけの 口（rayHit・preview・coops など）は そのまま 通す。持ち物・だっこ・あみ・出来事の `by` は `AnimalManager` が 人ごとに 持つ。
 */
export function createP2Animals(m: AnimalManager): AnimalApi {
  return {
    rayHit: (o, d, max) => m.rayHit(o, d, max),
    preview: (id, held) => m.preview(id, held),
    isFriend: (id) => m.isFriend(id),
    emitHint: (h) => m.emitHint(h, 2),
    feed: (id, item) => m.feed(id, item, 2),
    pet: (id) => m.pet(id, 2),
    natsukiView: (id) => m.natsukiView(id),
    isFull: (id) => m.isFull(id),
    swingNet: (block) => m.swingNet(block, 2),
    carryHold: (id, t) => m.carryHold(id, t, 2),
    putDown: (spot) => m.putDown(spot, 2),
    putDownWhy: () => m.putDownWhy(2),
    carrying: () => m.carrying(2),
    forEachVisible: (fn) => m.forEachVisible(fn),
    placeCoop: (x, y, z, dir) => m.placeCoop(x, y, z, dir),
    previewCoop: (x, y, z, dir) => m.previewCoop(x, y, z, dir),
    kits: () => m.kits(),
    coops: () => m.coops(),
    kitAt: (x, y, z) => m.kitAt(x, y, z),
    coopAt: (x, y, z) => m.coopAt(x, y, z),
    useKit: (x, y, z, held) => m.useKit(x, y, z, held, 2),
    collectCoop: (id) => m.collectCoop(id, 2),
    breakCoop: (id, first) => m.breakCoop(id, first, 2),
    removeCoop: (id) => m.removeCoop(id),
    machoMiss: (n) => m.machoMiss(n),
    serialize: () => m.serialize(),
    deserialize: (data) => m.deserialize(data),
    forEachKit: (fn) => m.forEachKit(fn),
    forEachCoop: (fn) => m.forEachCoop(fn),
    throwSpot: (aim) => m.throwSpot(aim, 2),
    startThrow: (aim) => m.startThrow(aim, 2),
    throwTo: (x, y, z) => m.throwTo(x, y, z, 2),
    homePop: () => m.homePop(),
    meatList: (id) => m.meatList(id),
    meat: (id, kid) => m.meat(id, kid, 2),
    meatSay: () => m.meatSay(2),
    finishMeat: () => m.finishMeat(),
    kitIcons: (aimed, holdingEgg) => m.kitIcons(aimed, holdingEgg),
    fighters: () => m.fighters(),
    fightCue: (c) => m.fightCue(c),
  };
}
