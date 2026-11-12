import { beforeAll, describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import { houseRig } from './houseRig';
import { kindBlocks } from './recipes/kinds';
import { loadPlaced, watchPlaced, type PlacedLooksLike, type PlacedLooksMod } from './recipes/craftKit';

/**
 * HOUSE-2C（レビューの 指摘）: 建築士さんが 同じ id を 置きかえても、手で 置いた 案の 記録は 消える（仕様 §2.7）。
 * てつの との 4 つは あける・しめる の かわりで 記録を 消さない きまり（cellChanged）が ある ので、建築士さんの 置き方が 自分で 消す。
 * watchPlaced（本物の watchBlocks の かわり）→ cellChanged の 道を とおして 確かめる。
 */
let M: PlacedLooksMod;
beforeAll(async () => {
  M = await loadPlaced();
});

describe('建築士さんの 置きかえで 手置きの 記録が 消える（同じ id でも）', () => {
  it('てつの と: 建てる 家の 戸の マスに 同じ id の 戸と 記録が あっても、buildNow の あとは 記録が ない', () => {
    const r = houseRig();
    const placed = (r.sys as unknown as { placedLooks: PlacedLooksLike }).placedLooks;
    expect(placed).toBeInstanceOf(M.PlacedLooks);
    watchPlaced(r.world, placed);
    r.sys.recipes.learn('door_tetsu');
    r.talk();
    r.make([{ op: 'door', kind: 'tetsu_mura' }, { op: 'place', kind: 'futon', x: 0, z: 0 }, { op: 'place', kind: 'chair', x: 4, z: 0 }]);
    const number = r.hook.blueprints().at(-1)!.number;
    const AT = { x: 20, y: 11, z: 20 };
    // 戸は 外の 箱の 南がわ（＋z）の まん中の 下の マス。いちど 建てて 場所を 知る
    r.sys.buildNow(number, AT);
    const door = r.hook.houses().at(-1)!.door;
    const lo = kindBlocks('door', 'tetsu_mura')[0] as BlockId;
    expect(r.world.getBlock(door.x, door.y, door.z), '建てた 戸').toBe(lo);
    placed.set(door.x, door.y, door.z, 'kozan', 's', lo);
    expect(placed.get(door.x, door.y, door.z), '手で 置いた 記録').not.toBeNull();
    // 同じ 家を もういちど 建てる（同じ id の 戸を 置きなおす）。cellChanged だけなら 戸の あけしめと 見て のこって しまう
    r.sys.buildNow(number, AT);
    expect(placed.get(door.x, door.y, door.z), '建築士さんの 置きかえで 消える').toBeNull();
  });
});
