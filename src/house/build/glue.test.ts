import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../contracts';
import { InventoryImpl } from '../../inventory/Inventory';
import { isScaffoldId } from '../../world/blocks/buildBlocks';
import { NOD_STEPS } from '../architect';
import { makeFakeWorld } from '../fakeWorld';
import { createHouseHook } from '../hook';
import { HouseSystem, type HouseSfx } from '../system';
import { FAREWELL_TICKS, MSG } from './tuning';

/** ユニット 3・5・10〜15（AC18〜AC21・AC31・AC32c・AC36・AC40・AC51）: 一覧 → 上空の 視点 → 建築 → 完成 → 保存。世界は ちいさな 平らな 床 */
const SPAWN = { x: 64.5, z: 64.5, yawDeg: 0 };
const PAD = { x: 70, z: 60 };
const GY = 10;

function rig(opts: { player?: { x: number; y: number; z: number }; held?: () => ItemId | null } = {}) {
  const world = makeFakeWorld({ height: () => GY });
  const bag = new InventoryImpl();
  const player = opts.player ?? { x: SPAWN.x, y: GY + 1, z: SPAWN.z };
  const sfx: HouseSfx[] = [];
  const sys = new HouseSystem({
    seed: 77,
    world,
    spawn: () => SPAWN,
    player: () => player,
    bag,
    voice: () => undefined,
    gave: () => undefined,
    onOpen: () => undefined,
    onClose: () => undefined,
    isLand: () => true,
    play: (e) => sfx.push(e),
    ...(opts.held ? { held: opts.held } : {}),
  });
  sys.state.record.toolsGiven = true;
  sys.state.record.fudeGiven = true;
  sys.update();
  const hook = createHouseHook(sys);
  const talk = (): void => {
    sys.talkTo(sys.architects()[0]!.id);
    for (let i = 0; i < NOD_STEPS; i++) sys.update();
  };
  const make = (ops: unknown[] = [{ op: 'place', kind: 'futon', x: 0, z: 0 }, { op: 'place', kind: 'chair', x: 4, z: 0 }]): number => {
    bag.add('paper', 2);
    bag.add('fude', 1);
    sys.press('editor');
    for (const op of ops) expect(hook.edit(op)).toBe(true);
    sys.press('next');
    sys.press('next');
    for (const ch of 'もも') expect(hook.edit({ op: 'char', ch })).toBe(true);
    sys.press('done');
    return hook.blueprints().at(-1)!.slot;
  };
  const stock = (slot: number, extra: Record<string, number> = {}): void => {
    for (const r of hook.need(slot)) {
      const n = r.need + (extra[r.item] ?? 0);
      if (n > 0) {
        bag.add(r.item, n);
        sys.deposit(r.item, n);
      }
    }
  };
  const pad = (x = PAD.x, z = PAD.z, w = 7, d = 7): void => {
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) world.setBlock(x + dx, GY, z + dz, 'katame_tsuchi');
  };
  const run = (n: number): void => {
    for (let i = 0; i < n; i++) sys.update();
  };
  /** 一覧 → えらぶ → 上空の 視点 → 決定 → ［ここに たてる］ */
  const startBuild = (slot: number): void => {
    sys.press('build');
    sys.press('pick', slot);
    sys.skyDecide();
    sys.skyDecide();
  };
  return { world, bag, player, sys, hook, sfx, talk, make, stock, pad, run, startBuild };
}

describe('AC18 一覧（システム）', () => {
  it('せっけいずが 0 まい: ページは 上の まま ＋ ふきだし', () => {
    const r = rig();
    r.talk();
    expect(r.sys.menu().buttons.find((b) => b.id === 'build')?.enabled).toBe(true);
    r.sys.press('build');
    expect(r.sys.menu()).toMatchObject({ page: 'top', bubble: MSG.noPlan });
  });
  it('材料が たりない: need ＋「ざいりょうが たりないよ」。おまけの 分は ひいた 数で 判定', () => {
    const r = rig();
    r.talk();
    const slot = r.make([{ op: 'place', kind: 'futon', x: 0, z: 0 }, { op: 'place', kind: 'chair', x: 4, z: 0 }]);
    r.sys.press('build');
    expect(r.sys.menu().buttons.find((b) => b.id === `pick-${slot}`)?.enabled).toBe(false);
    r.sys.press('pick', slot);
    expect(r.sys.menu()).toMatchObject({ page: 'need', bubble: MSG.short, build: true });
    r.sys.press('close');
    r.talk();
    r.stock(slot);
    expect(r.hook.need(slot).find((x) => x.item === 'cloth')).toMatchObject({ need: 0, bonus: 3 });
    r.sys.press('build');
    expect(r.sys.menu().buttons.find((b) => b.id === `pick-${slot}`)?.enabled).toBe(true);
  });
});

describe('AC19・AC20 場所と 確かめ', () => {
  it('かためた つちが なければ 上空の 視点に ならない。あれば sites() は その 1 か所、cursor は 近い 場所', () => {
    const r = rig();
    r.talk();
    const slot = r.make();
    r.stock(slot);
    r.sys.press('build');
    r.sys.press('pick', slot);
    expect(r.sys.menu()).toMatchObject({ page: 'pick', bubble: MSG.noSite });
    expect(r.hook.sites()).toEqual([]);
    r.pad();
    r.sys.press('pick', slot);
    expect(r.sys.menu().page).toBe('sky');
    expect(r.hook.sites()).toEqual([{ x: PAD.x, y: GY, z: PAD.z }]);
    expect(r.hook.cursor()).toMatchObject({ x: PAD.x, z: PAD.z, ok: true, confirm: false });
  });
  it('決定は まだ 何も へらさない。no・Esc は まどだけ とじる。yes で ちょうど へる・せっけいずは のこる', () => {
    const r = rig();
    r.talk();
    const slot = r.make();
    r.stock(slot, { log: 5 });
    r.pad();
    const before = r.hook.kura();
    const rows = r.hook.need(slot);
    r.sys.press('build');
    r.sys.press('pick', slot);
    r.sys.skyDecide();
    expect(r.hook.cursor()?.confirm).toBe(true);
    expect(r.hook.kura()).toEqual(before);
    expect(r.hook.building()).toBeNull();
    r.sys.press('no');
    expect(r.hook.cursor()).toMatchObject({ confirm: false, x: PAD.x });
    r.sys.skyDecide();
    r.sys.escape();
    expect(r.hook.cursor()?.confirm).toBe(false);
    r.sys.escape();
    expect(r.sys.menu().page).toBe('pick');
    expect(r.hook.building()).toBeNull();
    r.sys.press('pick', slot);
    r.sys.skyDecide();
    r.sys.press('yes');
    const after = r.hook.kura();
    for (const x of rows) expect(after[x.item] ?? 0, x.item).toBe((before[x.item] ?? 0) - x.need);
    expect(r.hook.blueprints().map((b) => b.slot)).toContain(slot);
    expect(r.hook.building()).toMatchObject({ name: 'もものいえ', w: 5, d: 5 });
    expect(r.sfx).toContainEqual({ k: 'start' });
    expect(r.sys.menu().open).toBe(false);
  });
});

describe('AC21・AC31・AC36・AC40・AC51 建築 → 完成', () => {
  const FAST = 120;
  function built() {
    const r = rig();
    r.sys.settings.houseBuildTicks = FAST;
    r.talk();
    const slot = r.make();
    r.stock(slot);
    r.pad();
    return { r, slot };
  }
  it('おまけ: 1 けん目を 建て はじめると firstBonus が false。建築中は build が 押せない', () => {
    const { r, slot } = built();
    expect(r.hook.firstBonus()).toBe(true);
    r.startBuild(slot);
    expect(r.hook.firstBonus()).toBe(false);
    expect(r.sys.menu().bubble, 'はじめての いえの ひとこと').toBe(MSG.bonus);
    r.talk();
    expect(r.sys.menu().buttons.find((b) => b.id === 'build')?.enabled).toBe(false);
    expect(r.sys.menu().bubble).toContain('もものいえ');
    r.sys.press('close');
  });
  it('はじめの ひとこと（bye）は FAREWELL_TICKS で きえる', () => {
    const { r, slot } = built();
    r.startBuild(slot);
    expect(r.sys.menu().bubble).toBe(MSG.bonus);
    r.run(FAREWELL_TICKS - 1);
    expect(r.sys.menu().bubble, 'あと 1 ステップは のこる').toBe(MSG.bonus);
    r.run(1);
    expect(r.sys.menu().bubble, 'きえる').toBe('');
  });
  it('建築士さんは 戸の 前（4 マス 以内）に うつる。建築中は 足場・歩いて 入れない', () => {
    const { r, slot } = built();
    r.startBuild(slot);
    const a = r.sys.architects()[0]!;
    const door = { x: PAD.x + 3.5, z: PAD.z + 7.5 };
    expect(Math.hypot(a.x - door.x, a.z - door.z)).toBeLessThanOrEqual(4);
    expect(a.busy).toBe(true);
    const scaf = (): number => {
      let n = 0;
      for (let y = GY; y < GY + 5; y++) for (let z = PAD.z; z < PAD.z + 7; z++) for (let x = PAD.x; x < PAD.x + 7; x++) if (isScaffoldId(r.world.getBlock(x, y, z) as string)) n++;
      return n;
    };
    expect(scaf()).toBeGreaterThan(0);
    expect(r.sys.build.builder.keepOut(PAD.x + 3, GY + 1, PAD.z + 3)).toBe(true);
    expect(r.sys.build.builder.keepOut(PAD.x - 1, GY + 1, PAD.z + 3)).toBe(false);
    r.run(FAST - 1);
    expect(r.hook.building()?.leftTicks).toBe(1);
    expect(r.sys.celebrate().confetti).toBe(0);
    r.run(1);
    expect(r.hook.building()).toBeNull();
    expect(scaf()).toBe(0);
    expect(r.hook.houses()).toHaveLength(1);
    expect(r.hook.houses()[0]).toMatchObject({ name: 'もものいえ', doorOpen: false, outer: { w: 7, d: 7 } });
    expect(r.sys.celebrate().confetti).toBe(1);
    expect(r.sys.celebrate().banner?.text).toBe('もものいえ が できた！');
    expect(r.sfx.filter((e) => e.k === 'done')).toHaveLength(1);
    r.run(300);
    expect(r.sys.celebrate().confetti).toBe(1);
  });
  it('2 けん目は おまけが ない。同じ せっけいずで また 建てられる。12 けん目も 始まる', () => {
    const { r, slot } = built();
    r.startBuild(slot);
    r.run(FAST);
    expect(r.hook.firstBonus()).toBe(false);
    for (let n = 2; n <= 12; n++) {
      r.stock(slot);
      const x = PAD.x + 10 * (n - 1);
      r.pad(x, PAD.z);
      r.player.x = x + 3.5;
      r.talk();
      expect(r.sys.menu().buttons.find((b) => b.id === 'build')?.enabled, `${n} けん目`).toBe(true);
      r.startBuild(slot);
      expect(r.hook.building(), `${n} けん目が 始まった`).not.toBeNull();
      r.run(FAST);
    }
    expect(r.hook.houses()).toHaveLength(12);
  });
  it('プレイヤーが 場所の 中に いると 戸の 前の 外へ うつる', () => {
    const { r, slot } = built();
    r.player.x = PAD.x + 3.5;
    r.player.z = PAD.z + 3.5;
    r.startBuild(slot);
    expect(r.player.z).toBeGreaterThanOrEqual(PAD.z + 7);
  });
});

describe('AC32c 保存', () => {
  it('40% で 保存 → 読むと 同じ 進み・のこりで 完成。前の セーブ（キーなし）は 家なし・おまけ あり', () => {
    const a = rig();
    a.sys.settings.houseBuildTicks = 1000;
    a.talk();
    const slot = a.make();
    a.stock(slot);
    a.pad();
    a.startBuild(slot);
    a.run(400);
    const save = JSON.parse(JSON.stringify(a.sys.serialize()));
    const left = a.hook.building()!.leftTicks;
    const b = rig();
    b.sys.load(save);
    expect(b.hook.building()).toMatchObject({ name: 'もものいえ', leftTicks: left, at: { x: PAD.x, y: GY, z: PAD.z } });
    expect(b.hook.firstBonus()).toBe(false);
    b.sys.settings.houseBuildTicks = 99999;
    for (let i = 0; i < left; i++) b.sys.update();
    expect(b.hook.building()).toBeNull();
    expect(b.hook.houses()).toHaveLength(1);
    const old = rig();
    old.sys.load({ v: 2, kura: {}, first: null, toolsGiven: true, fudeGiven: true, blueprints: [], next: 1 });
    expect(old.hook.building()).toBeNull();
    expect(old.hook.houses()).toEqual([]);
    expect(old.hook.firstBonus()).toBe(true);
  });
  it('家の 記録は 読み書きで 同じ', () => {
    const a = rig();
    a.sys.settings.houseBuildTicks = 10;
    a.talk();
    const slot = a.make();
    a.stock(slot);
    a.pad();
    a.startBuild(slot);
    a.run(10);
    const saved = JSON.parse(JSON.stringify(a.sys.serialize()));
    const b = rig();
    b.sys.load(saved);
    expect(b.hook.houses()).toEqual(a.hook.houses());
  });
});

describe('みずもり・どうづき（システム）', () => {
  it('みずもり: 持って いる 間だけ cells（169）。持ちかえても base は のこる。音は 1 回', () => {
    let held: ItemId | null = 'mizumori';
    const r = rig({ held: () => held });
    r.sys.build.useLevel(60, GY, 60);
    expect(r.hook.level().base).toEqual({ x: 60, y: GY, z: 60 });
    expect(r.hook.level().cells.length).toBe(169);
    held = null;
    expect(r.hook.level().cells).toEqual([]);
    expect(r.hook.level().base).toEqual({ x: 60, y: GY, z: 60 });
    expect(r.sfx.filter((e) => e.k === 'level')).toHaveLength(1);
  });
  it('どうづき: 20 ステップに 1 回。ならした あと 音は 掛け声 ＋ ドスン、かためた つちは soft', () => {
    const r = rig();
    r.sys.build.useTamp(60, GY, 60);
    r.sys.build.useTamp(60, GY, 60);
    expect(r.sfx.filter((e) => e.k === 'dozuki')).toEqual([{ k: 'dozuki', hard: false }]);
    expect(r.world.getBlock(60, GY, 60)).toBe('katame_tsuchi');
    r.run(19);
    r.sys.build.useTamp(60, GY, 60);
    expect(r.sfx.filter((e) => e.k === 'dozuki')).toHaveLength(1);
    r.run(1);
    r.sys.build.useTamp(60, GY, 60);
    expect(r.sfx.filter((e) => e.k === 'dozuki').at(-1)).toEqual({ k: 'dozuki', hard: true });
  });
});
