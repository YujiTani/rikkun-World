import { describe, expect, it } from 'vitest';
import { InventoryImpl } from '../inventory/Inventory';
import { watchBlocks } from './blockWatch';
import { makeFakeWorld } from './fakeWorld';
import { createHouseHook } from './hook';
import { doorIndex, emptyState } from './editor/model';
import { MSG } from './editor/tuning';
import { RENAME_SAY } from './rename';
import { HouseSystem } from './system';

/** HOUSE-1C PR-1: 窓口 buildNow・houses・blockAt・renaming・nameBand と なまえを かえる の 通し（戸の 変化は blockWatch から 記録へ） */

const AT = { x: 40, y: 10, z: 40 };

function make() {
  const bag = new InventoryImpl();
  /** 名前の 帯を 出す 合図〔上の 帯の 列へ〕 */
  const bands: string[] = [];
  const player = { x: 64.5, y: 11, z: 64.5 };
  const world = makeFakeWorld({ height: () => 9 });
  const sys = new HouseSystem({
    seed: 77,
    world,
    spawn: () => ({ x: 64.5, z: 64.5, yawDeg: 0 }),
    player: () => player,
    bag,
    voice: () => {},
    gave: () => {},
    onOpen: () => {},
    onClose: () => {},
    isLand: () => true,
    nameBand: (text) => bands.push(text),
  });
  watchBlocks(
    Object.assign(world, { fill: () => 0 }),
    sys.watcher,
  );
  const draft = emptyState();
  draft.name = { front: 'あい', back: 'ハウス' };
  draft.furniture = [{ kind: 'table', x: 0, z: 0, rot: 0 }, { kind: 'chair', x: 3, z: 3, rot: 1 }];
  const number = sys.state.register(draft);
  return { sys, world, player, number, bands, hook: createHouseHook(sys) };
}

describe('buildNow ・ houses ・ blockAt', () => {
  it('せっけいずから 家を その場に 建てて 記録を 1 件 つくる。知らない 番号は null で 何も 書かない', () => {
    const { sys, world, number } = make();
    expect(sys.buildNow(999, AT)).toBeNull();
    expect(sys.houses()).toEqual([]);
    const bp = sys.state.blueprint(number)!;
    const rec = sys.buildNow(number, AT)!;
    const ow = bp.w + 2;
    const od = bp.d + 2;
    const door = { x: AT.x + 1 + doorIndex(bp), y: AT.y + 1, z: AT.z + od - 1 };
    expect(rec).toMatchObject({ name: 'あいハウス', number, outer: { w: ow, d: od }, door, doorOpen: false });
    expect(sys.houses()).toEqual([rec]);
    // 床・やね・戸・ちょうちん・家具
    expect(world.getBlock(AT.x, AT.y, AT.z)).toBe('house_floor');
    expect(world.getBlock(AT.x + ow - 1, AT.y + 4, AT.z + od - 1)).toBe('house_roof');
    expect(world.getBlock(door.x, door.y, door.z)).toBe('house_door');
    expect(world.getBlock(door.x, door.y + 1, door.z)).toBe('house_door_top');
    expect(world.getBlock(AT.x + 1 + (bp.w - 1) / 2, AT.y + 3, AT.z + 1 + (bp.d - 1) / 2)).toBe('lantern');
    expect(sys.blockAt(AT.x + 1 + 3, AT.y + 1, AT.z + 1 + 3)).toEqual({ id: 'chair_w', item: 'chair', dir: 1 });
    expect(sys.blockAt(door.x, door.y + 1, door.z)).toEqual({ id: 'house_door_top', item: 'house_door', dir: null });
    expect(sys.blockAt(AT.x + 1, AT.y + 2, AT.z + 1).item, '空気は アイテム なし').toBeNull();
  });

  it('窓口 hook でも 同じ（buildNow・houses・blockAt・renaming）', () => {
    const { hook, number } = make();
    const rec = hook.buildNow(number, AT)!;
    expect(hook.houses()).toEqual([rec]);
    expect(hook.blockAt(rec.door.x, rec.door.y, rec.door.z).id).toBe('house_door');
    expect(hook.renaming()).toBeNull();
  });

  it('戸を ほる／かえる と 記録が ついてくる（blockWatch → 記録）', () => {
    const { sys, world, number } = make();
    const rec = sys.buildNow(number, AT)!;
    world.setBlock(rec.door.x, rec.door.y, rec.door.z, 'house_door_open');
    expect(sys.houses()[0]!.doorOpen).toBe(true);
    world.setBlock(rec.door.x, rec.door.y, rec.door.z, 'house_door');
    expect(sys.houses()[0]!.doorOpen).toBe(false);
    world.setBlock(rec.door.x, rec.door.y, rec.door.z, 'air');
    world.setBlock(rec.door.x, rec.door.y + 1, rec.door.z, 'air');
    expect(sys.houses()).toEqual([]);
  });
});

describe('名前の 帯の 合図（update で 1 ステップずつ）', () => {
  it('戸の 外から 戸を 通って 中に 入ると 1 回 だけ 名前を 渡す（外 → 戸 → 外 では 渡さない）', () => {
    const { sys, player, number, bands } = make();
    const rec = sys.buildNow(number, AT)!;
    const at = (dz: number): void => {
      player.y = rec.door.y;
      player.x = rec.door.x + 0.5;
      player.z = rec.door.z + 0.5 + dz;
      sys.update();
    };
    at(2);
    at(1);
    at(0); // 戸の マス
    expect(bands, '戸の マスでは まだ').toEqual([]);
    at(1); // 引き返す
    expect(bands, '外 → 戸 → 外').toEqual([]);
    at(0);
    at(-1); // 中
    expect(bands).toEqual(['あいハウス']);
    at(-2);
    at(-1);
    expect(bands, '中を 歩いても 出なおさない').toEqual(['あいハウス']);
  });
});

describe('なまえを かえる（メニュー 通し）', () => {
  it('家が 0 けんの あいだは 押せない。建てると 押せて、一覧 → 名前の 画面 → これで いい！ で 名前が かわる', () => {
    const { sys, world, number } = make();
    sys.state.record.toolsGiven = true;
    sys.state.record.fudeGiven = true;
    const a = sys.architects()[0] ?? null;
    sys.update();
    const id = (a ?? sys.architects()[0]!).id;
    sys.talkTo(id);
    for (let i = 0; i < 400 && !sys.menu().open; i++) sys.update();
    expect(sys.menu().buttons.find((b) => b.id === 'rename')?.enabled, '0 けん').toBe(false);
    sys.press('rename');
    expect(sys.menu().page, '押せない').toBe('top');
    const rec = sys.buildNow(number, AT)!;
    expect(world.getBlock(rec.door.x, rec.door.y, rec.door.z)).toBe('house_door');
    expect(sys.typing(), '上の メニュー').toBe(false);
    sys.press('rename');
    expect(sys.menu().page).toBe('rename');
    expect(sys.typing(), '一覧では キーを 止めない').toBe(false);
    expect(sys.menu().buttons.map((b) => b.id)).toEqual([`renamePick-${rec.id}`, 'close']);
    sys.press('renamePick', rec.id);
    expect(sys.menu().page).toBe('renameName');
    expect(sys.typing(), '名前の 画面では エディターと 同じく Esc いがいの キーを ゲームに とどけない').toBe(true);
    expect(sys.editing(), 'エディターでは ない').toBe(false);
    expect(sys.renaming()).toEqual({ id: rec.id, name: { front: 'あい', back: 'ハウス' } });
    sys.press('char-う');
    sys.press('suffix-3');
    sys.press('renameOk');
    expect(sys.menu().page).toBe('top');
    expect(sys.houses()[0]!.name).toBe('あいうひみつきち');
    expect(sys.state.blueprint(number)!.name, 'せっけいずの 名前は そのまま').toEqual({ front: 'あい', back: 'ハウス' });
    expect(sys.renaming()).toBeNull();
  });

  it('よくない ことば（AC53）: 字が 入らず ふきだし。これで いい！も 通らない。ふつうの 字を 打つと ふきだしが もどる', () => {
    const { sys, number } = make();
    sys.state.record.toolsGiven = true;
    sys.state.record.fudeGiven = true;
    sys.update();
    sys.talkTo(sys.architects()[0]!.id);
    for (let i = 0; i < 400 && !sys.menu().open; i++) sys.update();
    const rec = sys.buildNow(number, AT)!;
    sys.press('rename');
    sys.press('renamePick', rec.id);
    sys.press('erase');
    sys.press('erase');
    sys.press('char-し');
    const bubble = (): string => sys.menu().bubble;
    const before = bubble();
    sys.press('char-ね');
    expect(sys.renaming()?.name.front, 'しね は 入らない').toBe('し');
    expect(bubble()).toBe(MSG.ngWord);
    expect(bubble()).not.toBe(before);
    sys.press('char-い');
    expect(sys.renaming()?.name.front).toBe('しい');
    expect(bubble(), 'ふつうの 字で もどる').toBe(RENAME_SAY.name);
  });
});
