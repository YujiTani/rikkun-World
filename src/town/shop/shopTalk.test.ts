import { describe, expect, it } from 'vitest';
import { SHOP_TALK_ID, shopkeeperRay, withShopTalk, type TalkPort } from './shopTalk';

/** TOWN-1 1C: よろずやさんに 話す 口（右クリック・ZL は 建築士さんと 同じ 道） */
describe('よろずやさんを ねらう・話す', () => {
  const at = { x: 10.5, y: 5, z: 20.5 };
  it('まっすぐ 見れば 当たる。上・横・遠すぎは 当たらない', () => {
    expect(shopkeeperRay(at, { x: 10.5, y: 6.6, z: 22.5 }, { x: 0, y: 0, z: -1 }, 5)).toBeCloseTo(1.55);
    expect(shopkeeperRay(at, { x: 10.5, y: 8, z: 22.5 }, { x: 0, y: 0, z: -1 }, 5)).toBeNull();
    expect(shopkeeperRay(at, { x: 12.5, y: 6, z: 22.5 }, { x: 0, y: 0, z: -1 }, 5)).toBeNull();
    expect(shopkeeperRay(at, { x: 10.5, y: 6, z: 30.5 }, { x: 0, y: 0, z: -1 }, 5)).toBeNull();
  });
  it('建築士さんより 近ければ よろずやさん。話すと 話した 人で 開く。たたいても 何も しない', () => {
    const calls: string[] = [];
    const base: TalkPort = {
      rayHit: () => ({ id: 'a1', distance: 3 }),
      talk: (id) => (calls.push(`talk ${id}`), true),
      hit: (id) => void calls.push(`hit ${id}`),
    };
    const opened: number[] = [];
    const port = withShopTalk(base, () => ({ at: () => at, talk: (w) => (opened.push(w), true) }), 2);
    const h = port.rayHit({ x: 10.5, y: 6, z: 22.5 }, { x: 0, y: 0, z: -1 }, 5)!;
    expect(h.id).toBe(SHOP_TALK_ID);
    expect(port.talk(h.id)).toBe(true);
    expect(opened).toEqual([2]);
    port.hit!(h.id);
    expect(calls).toEqual([]);
    expect(port.talk('a1')).toBe(true);
    expect(calls).toEqual(['talk a1']);
  });
  it('建築士さんの ほうが 近い・街が ない ときは 今までどおり', () => {
    const base: TalkPort = { rayHit: () => ({ id: 'a1', distance: 0.5 }), talk: () => true };
    expect(withShopTalk(base, () => ({ at: () => at, talk: () => true }), 1).rayHit({ x: 10.5, y: 6, z: 22.5 }, { x: 0, y: 0, z: -1 }, 5)!.id).toBe('a1');
    const none: TalkPort = { rayHit: () => null, talk: () => true };
    expect(withShopTalk(none, () => null, 1).rayHit({ x: 10.5, y: 6, z: 22.5 }, { x: 0, y: 0, z: -1 }, 5)).toBeNull();
  });
});
