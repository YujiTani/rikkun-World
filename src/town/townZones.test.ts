import { afterEach, describe, expect, it } from 'vitest';
import type { BlockId, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { fallDamage } from '../combat/config';
import { townInside, townLocked, townSafe, bootTown } from '../game/wire/town';
import { townSiteOk } from '../house/build/glue';
import { emptyStreamRestore } from '../save/streamRestore';
import { terrainFor } from '../world/gen/terrain';
import { GEN_CONFIG } from '../world/gen/config';
import { startFeaturesOf } from '../world/gen/features';
import { shaftWorldFor } from '../world/gen/mineShafts';
import { chooseTown } from './townPlace';
import { TownPlan, stairMouth } from './townPlan';
import { CANAL, at } from './townLayout';
import { activateTown, currentTown, deactivateTown } from './townState';
import { TOWN } from './townTuning';

/** AC9 守り・AC8 安全地帯・AC42 落下・AC12 記録・AC7b あきち。数は townTuning の 表と combat の 表を 読む */
const SEED = 1;
afterEach(() => deactivateTown());

function setup() {
  const rec = chooseTown(SEED)!;
  const sp = terrainFor(SEED).spawn();
  const plan = activateTown(SEED, rec, { x: sp.x, z: sp.z });
  return { rec, plan, info: plan.info() };
}

describe('AC9 こわせない・置けない', () => {
  it('街の はんいは ロック・あきちの 中と 外の 1 マス 先は ロックなし', () => {
    const { info } = setup();
    const b = info.bounds;
    expect(townLocked(b.min.x, b.min.z)).toBe(true);
    expect(townLocked(b.max.x, b.max.z)).toBe(true);
    expect(townLocked(b.min.x - 1, b.min.z)).toBe(false);
    expect(townLocked(b.max.x + 1, b.max.z)).toBe(false);
    for (const lot of info.lots) {
      expect(townLocked(lot.min.x, lot.min.z)).toBe(false);
      expect(townLocked(lot.max.x, lot.max.z)).toBe(false);
      expect(townLocked(lot.min.x - 1, lot.min.z)).toBe(true);
    }
    // 用水路・石段も ロック
    for (const c of info.canal.water) expect(townLocked(c.x, c.z)).toBe(true);
    for (const s of info.canal.stairs) expect(townLocked(Math.floor(s.top.x), Math.floor(s.top.z))).toBe(true);
  });
  it('街が なければ ロックなし', () => {
    expect(currentTown()).toBeNull();
    expect(townLocked(0, 0)).toBe(false);
  });
});

describe('AC7b あきち', () => {
  it('家の 外（11×11）は 1 区画に 入る・はみ出す 場所と 道の 上は ダメ・街の 外は いつもどおり', () => {
    const { info, plan } = setup();
    const lot = info.lots[0]!;
    expect(townSiteOk(plan, lot.min.x, lot.min.z, 11, 11)).toBe(true);
    expect(townSiteOk(plan, lot.min.x + 1, lot.min.z + 1, 11, 11)).toBe(true);
    expect(townSiteOk(plan, lot.min.x + 2, lot.min.z, 11, 11)).toBe(false);
    // 区画の 横へ ずらして はみ出す（4 方向の どれかは 街の 中で あきちの 外）
    const shifted = [[-3, 0], [3, 0], [0, -3], [0, 3]].map(([dx, dz]) => townSiteOk(plan, lot.min.x + dx!, lot.min.z + dz!, 11, 11));
    expect(shifted.filter((ok) => !ok).length).toBeGreaterThanOrEqual(2);
    expect(townSiteOk(plan, info.plaza.x, info.plaza.z, 11, 11)).toBe(false);
    // 区画の あいだ（2 マス）を またいで 2 区画に かかる 7×7: 4 つの すみは あきちの 中でも ダメ（e2e town1b1 AC7b の「はみ出す 場所」）
    const [l0, l1] = [info.lots[0]!, info.lots[1]!];
    const w = 7;
    expect(TOWN.lots.gap).toBeLessThan(w);
    const alongZ = l1.min.z !== l0.min.z; // 区画の ならびは 街の 向きで x か z
    const dir = Math.sign(alongZ ? l1.min.z - l0.min.z : l1.min.x - l0.min.x);
    const edge = alongZ ? (dir > 0 ? l0.max.z : l0.min.z) : dir > 0 ? l0.max.x : l0.min.x; // l1 に 近い がわの はし
    const start = dir > 0 ? edge - 1 : edge + 1 - (w - 1); // はしの 2 マスと、あいだ 2 マスと、l1 の 3 マス
    const ox = alongZ ? l0.min.x + 2 : start;
    const oz = alongZ ? start : l0.min.z + 2;
    expect(plan.inLot(ox, oz) && plan.inLot(ox + w - 1, oz + w - 1), 'すみは どちらも あきちの 中').toBe(true);
    expect(townSiteOk(plan, ox, oz, w, w)).toBe(false);
    expect(townSiteOk(plan, info.bounds.min.x - 40, info.bounds.min.z, 11, 11)).toBe(true);
  });
  it('あきちの 中は 安全地帯', () => {
    const { info } = setup();
    for (const lot of info.lots) expect(townSafe({ x: lot.min.x + 6, z: lot.min.z + 6 })).toBe(true);
  });
});

describe('AC8 安全地帯のふち', () => {
  it('safe は 街 ＋ 8 マス・外は false', () => {
    const { info } = setup();
    expect(townSafe({ x: info.safe.min.x, z: info.safe.min.z })).toBe(true);
    expect(townSafe({ x: info.safe.min.x - 1, z: info.safe.min.z })).toBe(false);
    expect(townSafe({ x: info.safe.max.x + 1, z: info.safe.max.z })).toBe(false);
    expect(info.safe.min.x).toBe(info.bounds.min.x - TOWN.safeMargin);
  });
});

class W implements VoxelWorld {
  readonly size = { x: 64, y: 64, z: 64 };
  isLoaded(): boolean { return true; }
  loadedBounds() { return { x0: 0, z0: 0, x1: 64, z1: 64 }; }
  getBlock(): BlockId | 'outside' { return 'air'; }
  setBlock() { return true; }
  isSolid() { return false; }
}

function rig(zone: { safe: boolean; inside: boolean }) {
  const player = { position: { x: 5, y: 40, z: 5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  const combat = new PlayerCombatImpl({
    world: new W(),
    player: { get: () => player, set: (v) => Object.assign(player.position, v.position ?? {}) },
    inventory: new InventoryImpl(),
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => ({ x: 1, y: 40, z: 1, yawDeg: 0, pitchDeg: 0 }),
    inSafeZone: () => zone.safe,
    noFall: () => zone.inside,
  });
  const drop = (h: number) => {
    combat.update();
    player.onGround = false;
    const top = player.position.y;
    while (player.position.y > top - h + 1e-9) {
      player.position.y = Math.max(top - h, player.position.y - 0.4);
      combat.update();
    }
    player.onGround = true;
    combat.update();
  };
  return { combat, drop };
}

describe('AC42 落下・AC8 こうげき', () => {
  it('街の 中は 5・6・8 マス 落ちても 体力 0 へる・外は 今の きまりどおり', () => {
    const cfg = rig({ safe: false, inside: false }).combat;
    void cfg;
    for (const h of [5, 6, 8]) {
      const a = rig({ safe: true, inside: true });
      const hp0 = a.combat.hp();
      a.drop(h);
      expect(a.combat.hp(), `街の 中 ${h}`).toBe(hp0);
    }
    for (const h of [5, 8]) {
      const b = rig({ safe: false, inside: false });
      const hp0 = b.combat.hp();
      b.drop(h);
      expect(hp0 - b.combat.hp(), `外 ${h}`).toBeGreaterThan(0);
    }
    expect(fallDamage(5, 3, 1)).toBe(2);
  });
  it('安全地帯の 中は 妖怪の こうげきで ハートが へらない・外は へる', () => {
    const inn = rig({ safe: true, inside: false });
    const hp0 = inn.combat.hp();
    expect(inn.combat.damage(3, 'karakasa', { x: 0, y: 0, z: 0 })).toBe(false);
    expect(inn.combat.hp()).toBe(hp0);
    const out = rig({ safe: false, inside: false });
    expect(out.combat.damage(3, 'karakasa', { x: 0, y: 0, z: 0 })).toBe(true);
  });
  it('足もとが 街の 中か は 窓口の 関数が 答える', () => {
    const { info } = setup();
    expect(townInside({ x: info.center.x, z: info.center.z })).toBe(true);
    expect(townInside({ x: info.bounds.min.x - 1, z: info.center.z })).toBe(false);
  });
});

describe('AC12 記録', () => {
  it('記録が ない 保存は 1 回 きまり、その 記録が 残る（2 回目は 同じ）・town=off は 作らない', () => {
    const r1 = emptyStreamRestore();
    bootTown(SEED, r1, '?nosave=1');
    expect(r1.town).toBeTruthy();
    const plan1 = new TownPlan(r1.town!).info();
    deactivateTown();
    const r2 = emptyStreamRestore();
    r2.town = r1.town; // 保存して 開きなおし
    bootTown(SEED, r2, '?nosave=1');
    expect(r2.town).toEqual(r1.town);
    expect(currentTown()!.info()).toEqual(plan1);
    deactivateTown();
    const r3 = emptyStreamRestore();
    bootTown(SEED, r3, '?nosave=1&town=off');
    expect(r3.town).toBeUndefined();
    expect(currentTown()).toBeNull();
  });
  it('前の セーブの 列（プレイヤーの 物）に かかる 場所は さける', () => {
    const rec = chooseTown(SEED)!;
    const cx = Math.floor((rec.x0 + 50) / 16);
    const cz = Math.floor((rec.z0 + 50) / 16);
    const rec2 = chooseTown(SEED, { occupied: (x, z) => x === cx && z === cz });
    expect(rec2).not.toBeNull();
    const m = TOWN.keepMargin;
    const hit = !(rec2!.x0 - m > cx * 16 + 15 || rec2!.x0 + TOWN.size + m < cx * 16 || rec2!.z0 - m > cz * 16 + 15 || rec2!.z0 + TOWN.size + m < cz * 16);
    expect(hit).toBe(false);
  });
});

describe('AC39 石段の 口', () => {
  it('あかり 1・のぼり 1 は 上り口の りょうわき（歩く マスを ふさがない・用水路の 外）', () => {
    const { plan } = setup();
    const L = plan.layout;
    const blocked = new Set([...plan.stairTopAt.keys()]);
    for (const st of L.stairs) {
      const m = stairMouth(st);
      const lk = at(m.light.u, m.light.v);
      const bk = at(m.banner.u, m.banner.v);
      expect(plan.stairTopAt.get(lk)).toBe('light');
      expect(plan.stairTopAt.get(bk)).toBe('banner');
      expect(L.canal[lk]).toBe(CANAL.none);
      expect(L.canal[bk]).toBe(CANAL.none);
      const pu = Math.abs(st.dir.dv);
      const pv = Math.abs(st.dir.du);
      for (let k = 0; k < TOWN.canal.stairWidth; k++) expect(blocked.has(at(st.top.u + pu * k, st.top.v + pv * k)), '上り口の 地面').toBe(false);
    }
    expect(plan.info().canal.stairs.length).toBeLessThanOrEqual(TOWN.canal.stairMax);
  });
});

describe('はじまりの 坑道を 切らない（MINE-1C の 通し）', () => {
  it('ふだんの シードで、街の はんいは 坑道の 道・入口の 盛り土の 列に かからない（街の 地ならしは 列を まるごと 書きかえる）', () => {
    const seed = GEN_CONFIG.defaultSeed;
    const shafts = shaftWorldFor(seed);
    const st = shafts.start()!.plan.shaft;
    const r = emptyStreamRestore();
    bootTown(seed, r, '?nosave=1', shafts);
    expect(r.town).toBeTruthy();
    const info = currentTown()!.info();
    const cols = [...shafts.path(st.id).map((c) => ({ x: c.x, z: c.z })), { x: st.entrance.x, z: st.entrance.z }];
    expect(cols.length).toBeGreaterThan(100);
    const inside = cols.filter((c) => c.x >= info.bounds.min.x && c.x <= info.bounds.max.x && c.z >= info.bounds.min.z && c.z <= info.bounds.max.z);
    expect(inside).toEqual([]);
  }, 30_000);
});

describe('はじまりの木を 街の 実際の 置き場所（坑道よけ つき）で 消さない（voxB-terrain AC14）', () => {
  it.each([GEN_CONFIG.defaultSeed, 1, 2, 3, 4, 5])('シード %i: 街の はんい・すそ・見通しの みちに はじまりの木が かからない', (seed) => {
    const shafts = shaftWorldFor(seed);
    const r = emptyStreamRestore();
    bootTown(seed, r, '?nosave=1', shafts);
    expect(r.town).toBeTruthy();
    const plan = currentTown()!;
    const info = plan.info();
    const m = TOWN.keepMargin;
    const f = startFeaturesOf(seed);
    expect(f.trees).toHaveLength(3);
    for (const t of f.trees) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = t.x + dx;
          const z = t.z + dz;
          if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) expect(plan.inCorridor(x, z), `木 (${t.x}, ${t.z}) の みき（と まわり 1 マス）が 見通しの みち`).toBe(false);
          expect(x >= info.bounds.min.x - m && x <= info.bounds.max.x + m && z >= info.bounds.min.z - m && z <= info.bounds.max.z + m, `木 (${t.x}, ${t.z}) が 街・すそ`).toBe(false);
        }
      }
    }
  }, 30_000);
});
