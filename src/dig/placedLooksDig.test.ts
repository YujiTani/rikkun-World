import { beforeAll, describe, expect, it } from 'vitest';
import type { BlockId, ItemId } from '../contracts';
import { HouseBook } from '../house/book';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { SkyDarkness } from '../world/light/skyDarkness';
import { WorldLight } from '../world/light/WorldLight';
import { kindBlocks, type LookBook } from '../house/recipes/lookKit';
import { loadPlaced, styledForms, watchPlaced, type Facing, type PlacedLooksLike, type PlacedLooksMod } from '../house/recipes/craftKit';
import { LOOK_DOOR_IDS } from '../world/blocks/houseLookBlocks';
import { PlaceRig, PlaceWorld } from './placeKit';

/**
 * HOUSE-2C AC18・AC18b（仕様 3.4 版 §2.6・§2.7・§6.2）: 手で 置く・ほる の 通し（本物の DigSystem・ユニット）。
 * ① 案の ある 形 ぜんぶ × 3 案: アイテムを 置くと その 形の lk_ ブロック・placedLook の 案・lookOf ・ほると その 案の アイテム 1 こ（むらに ならない）。
 * ② 向き: プレイヤーが 南・西・北・東 に 立って 置くと facing が s・w・n・e。⑥ 2P が 置いた 物を 1P が ほると 1P の 持ち物に その 案。
 * AC18: 作った 戸を 置いても 家の 記録は ふえない・あかりの まわりは 夜でも 湧かない。
 * 窓口の 名前は src/house/recipes/craftKit.ts の「2C の 約束」。数・id は 表から（#311）。
 */

let M: PlacedLooksMod;
beforeAll(async () => {
  M = await loadPlaced();
});
const forms = styledForms();
const YAW_FACING: ReadonlyArray<[number, Facing]> = [
  [0, 's'], // プレイヤーが ブロックの 南（＋z）に 立つ
  [90, 'w'],
  [180, 'n'],
  [270, 'e'],
];

/** 置いた ときの 記録を つないだ 世界（watchBlocks の かわりに onSet）。book は 空の 家の 記録 */
function setup(world: PlaceWorld = new PlaceWorld()): { rig: PlaceRig; placed: PlacedLooksLike; book: LookBook } {
  const placed = new M.PlacedLooks();
  const book = new HouseBook() as LookBook;
  watchPlaced(world, placed);
  const rig = new PlaceRig({ houseLook: () => book, placedLooks: () => placed }, world);
  return { rig, placed, book };
}
const resolve = (placed: PlacedLooksLike, book: LookBook, world: PlaceWorld, x: number, y: number, z: number): string | null =>
  M.resolveLook({ block: world.getBlock(x, y, z), placed, book }, x, y, z);
const count = (r: PlaceRig, item: string): number => r.inv.count(item as ItemId);

describe('AC18b ①: 案の ある 形 ぜんぶ × 3 案（表から）: 置く → 記録 → ほる', () => {
  for (const f of forms) {
    it(`${f.part}-${f.form}: 3 案 とも 置くと lk_ ブロック・placedLook の 案・lookOf。ほると その 案の アイテム 1 こ（むらに ならない）・ほった あと 記録は 消える`, () => {
      for (let i = 0; i < f.items.length; i++) {
        const item = f.items[i]!;
        const style = f.kinds[i]!.replace(`${f.form}_`, '');
        const { rig, placed, book } = setup();
        rig.hold(item, 1);
        const p = rig.aimFloor(90);
        rig.rightClick();
        expect(rig.world.getBlock(p.x, p.y, p.z), `${item}: その 形の ブロック`).toBe(f.blocks[0]);
        expect(count(rig, item), `${item}: 1 つ へる`).toBe(0);
        expect(placed.get(p.x, p.y, p.z)?.style, `${item}: 案`).toBe(style);
        expect(resolve(placed, book, rig.world, p.x, p.y, p.z), `${item}: lookOf`).toBe(f.kinds[i]);
        if (f.part === 'door') {
          // てつの と は 下・上の 2 マス とも 書く
          expect(rig.world.getBlock(p.x, p.y + 1, p.z), '戸の 上の マス').toBe(f.blocks[1]);
          expect(placed.get(p.x, p.y + 1, p.z)?.style, '上の マスも 書く').toBe(style);
        }
        expect(rig.aimAt(p.x, p.y, p.z), 'ねらえた').toBe(true);
        rig.breakAimed();
        expect(rig.world.getBlock(p.x, p.y, p.z), 'ほった').toBe('air');
        expect(count(rig, item), `${item}: その 案の アイテム 1 こ`).toBe(1);
        for (const other of f.items.filter((x) => x !== item)) expect(count(rig, other), `${item} を ほって ${other} は 出ない（むらに ならない）`).toBe(0);
        expect(placed.get(p.x, p.y, p.z), 'ほった あと 記録は 消える').toBeNull();
        if (f.part === 'door') expect(placed.get(p.x, p.y + 1, p.z), '上の 記録も 消える').toBeNull();
      }
    });
  }
});

describe('AC18b ②: 向き（置く マスから 見て プレイヤーが いる 方位。やねは のきが その がわ）', () => {
  const facing = forms.filter((f) => f.part === 'roof' || ['noren', 'hanadan', 'entotsu'].includes(f.form));
  for (const f of facing) {
    it(`${f.part}-${f.form}: 南・西・北・東 に 立って 置くと facing が s・w・n・e`, () => {
      for (const [yaw, want] of YAW_FACING) {
        const { rig, placed } = setup();
        rig.hold(f.items[1]!, 1);
        const p = rig.aimFloor(yaw);
        rig.rightClick();
        expect(rig.world.getBlock(p.x, p.y, p.z), `yaw ${yaw}: 置けた`).toBe(f.blocks[0]);
        expect(placed.get(p.x, p.y, p.z)?.facing, `yaw ${yaw}`).toBe(want);
      }
    });
  }
  it('向きを 使う 形が ある（表から）', () => {
    expect(facing.length).toBeGreaterThan(0);
  });
});

describe('AC18b ③: 世界の 変化で 消える（本物の setBlock の 道）', () => {
  it('置いた マスを setBlock で 空気・ほかの ブロックに すると 記録が 消える', () => {
    const f = forms.find((x) => x.part === 'roof')!;
    for (const after of ['air', 'stone'] as BlockId[]) {
      const { rig, placed } = setup();
      rig.hold(f.items[2]!, 1);
      const p = rig.aimFloor(90);
      rig.rightClick();
      expect(placed.get(p.x, p.y, p.z)).not.toBeNull();
      rig.world.setBlock(p.x, p.y, p.z, after);
      expect(placed.get(p.x, p.y, p.z), after).toBeNull();
    }
  });

  it('てつの と: あける・しめる では 下・上 とも のこる', () => {
    const f = forms.find((x) => x.part === 'door')!;
    const { rig, placed } = setup();
    rig.hold(f.items[1]!, 1);
    const p = rig.aimFloor(90);
    rig.rightClick();
    const [, , openB, openT] = [...LOOK_DOOR_IDS] as BlockId[];
    rig.world.setBlock(p.x, p.y, p.z, openB!);
    rig.world.setBlock(p.x, p.y + 1, p.z, openT!);
    expect(placed.get(p.x, p.y, p.z)?.style, 'あけた（下）').toBe('shiro');
    expect(placed.get(p.x, p.y + 1, p.z)?.style, 'あけた（上）').toBe('shiro');
  });

  it('④ 建てた 家の 物を ほって 同じ マスに 別の 案を 置く → 置いた 記録が 先（家の 記録は おしろ・手で 置いた のは こうざん）', () => {
    const f = forms.find((x) => x.part === 'wall')!;
    const { rig, placed, book } = setup();
    const at = { ...rig.aimFloor(90) }; // 置く マス（ゆかの 上）
    rig.world.setBlock(at.x, at.y, at.z, f.blocks[0]!);
    // 家の 記録を おしろの かべと して のこす
    (book as unknown as { lookAt: (x: number, y: number, z: number) => string | null }).lookAt = (x, y, z) => (x === at.x && y === at.y && z === at.z ? f.kinds[1]! : null);
    expect(resolve(placed, book, rig.world, at.x, at.y, at.z), '手で 置く 前は 家の 記録（おしろ）').toBe(f.kinds[1]);
    rig.world.setBlock(at.x, at.y, at.z, 'air');
    rig.hold(f.items[2]!, 1);
    expect(rig.aimFloor(90), '同じ マスに 置く').toEqual(at);
    rig.rightClick();
    expect(resolve(placed, book, rig.world, at.x, at.y, at.z), '置いた 記録の こうざん').toBe(f.kinds[2]);
    expect(rig.aimAt(at.x, at.y, at.z)).toBe(true);
    rig.breakAimed();
    expect(count(rig, f.items[2]!), 'ほると こうざん').toBe(1);
    expect(count(rig, f.items[1]!), 'おしろでは ない').toBe(0);
  });
});

describe('AC18b ⑥: 2 人（記録は 世界に 1 つ）', () => {
  it('2P が 置いた 物を 1P が ほると 1P の 持ち物に その 案（2P の 持ち物は かわらない）', () => {
    const f = forms.find((x) => x.part === 'roof')!;
    const world = new PlaceWorld();
    const placed = new M.PlacedLooks();
    const book = new HouseBook() as LookBook;
    watchPlaced(world, placed);
    const m4 = { houseLook: () => book, placedLooks: () => placed };
    const p2 = new PlaceRig(m4, world);
    const p1 = new PlaceRig(m4, world);
    p2.hold(f.items[2]!, 1);
    const p = p2.aimFloor(90);
    p2.rightClick();
    expect(placed.get(p.x, p.y, p.z)?.style, '2P が 置いた').toBe('kozan');
    expect(p1.aimAt(p.x, p.y, p.z)).toBe(true);
    p1.breakAimed();
    expect(count(p1, f.items[2]!), '1P の 持ち物に こうざん').toBe(1);
    expect(count(p2, f.items[2]!), '2P の 持ち物は かわらない').toBe(0);
    expect(placed.get(p.x, p.y, p.z)).toBeNull();
  });
});

describe('AC18: 置いた 物は ふつうの ブロック', () => {
  it('作った いえの と・てつの と を 置いても 家の 記録（houses）は ふえない', () => {
    const doors = ['house_door', ...forms.filter((f) => f.part === 'door').flatMap((f) => f.items)];
    for (const item of doors) {
      const { rig, book } = setup();
      rig.hold(item as ItemId, 1);
      const p = rig.aimFloor(90);
      rig.rightClick();
      expect(rig.world.getBlock(p.x, p.y, p.z), `${item}: 置けた`).not.toBe('air');
      expect(book.count(), `${item}: 家の 記録`).toBe(0);
    }
  });

  it('作った ほたるいしの あかり・すいしょう ランプ を 置いた まわり（ちょうちんと 同じ 範囲）は 夜でも 湧かない', () => {
    const light = (b: BlockId): { dark: (x: number, y: number, z: number) => boolean } => {
      const w = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
      w.fill(0, 0, 0, 31, 0, 31, 'stone');
      const d = new SkyDarkness();
      const l = new WorldLight(w, d);
      w.setBlock(16, 2, 16, b);
      d.value = 11; // 夜
      l.update();
      l.flush();
      return { dark: (x, y, z) => l.isDarkForSpawn(x, y, z) };
    };
    const lantern = light('lantern');
    const range: Array<[number, number, number]> = [];
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) for (let dy = 0; dy <= 3; dy++) if ((dx || dz || dy !== 1) && !lantern.dark(16 + dx, 1 + dy, 16 + dz)) range.push([16 + dx, 1 + dy, 16 + dz]);
    expect(range.length, 'ちょうちんの まわりに 湧かない マスが ある').toBeGreaterThan(0);
    for (const k of ['hotaru', 'suisho']) {
      const l = light(kindBlocks('light', k)[0]!);
      const dark = range.filter(([x, y, z]) => l.dark(x, y, z));
      expect(dark, `${k}: ちょうちんが 照らす マスで 湧く`).toEqual([]);
    }
  });
});
