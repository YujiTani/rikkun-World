import { describe, expect, it } from 'vitest';
import { houseRig } from './houseRig';
import { NOD_STEPS } from './architect';
import { HUT_ID } from './manager';
import { addPerson, type Person } from './stockKit';

/** TOWN-1 1B-2 AC10: こやの 建築士さんは house.architects() に first:false で ならび、HOUSE-1 と 同じ メニュー。るすの 間は ならばず 話せない */
const HUT = { x: 90.5, y: 11, z: 66.5, yaw: Math.PI };

function rig(away: { v: boolean }) {
  let person!: Person;
  return houseRig({
    extraDeps: (st) => {
      person = addPerson(st, { x: st.player.x + 2, y: st.player.y, z: st.player.z });
      return { hut: () => ({ ...HUT, away: () => away.v }), playerOf: (who: 1 | 2) => (who === 1 ? st.player : person.player), bagOf: (who: 1 | 2) => (who === 1 ? st.bag : person.bag) };
    },
  });
}

describe('こやの 建築士さん', () => {
  it('first:false で ならび、3,600 ステップ たっても 場所が かわらない', () => {
    const r = rig({ v: false });
    const a = r.sys.architects().find((q) => q.id === HUT_ID)!;
    expect(a).toBeTruthy();
    expect(a.first).toBe(false);
    r.run(3600);
    const b = r.sys.architects().find((q) => q.id === HUT_ID)!;
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.01);
  });

  it('1P も 2P も 話すと HOUSE-1 と 同じ メニューが 開く', () => {
    const away = { v: false };
    const r = rig(away);
    const outer = r.sys.architects().find((q) => q.first)!;
    for (const who of [1, 2] as const) {
      expect(r.sys.talkTo(HUT_ID, who, true)).toBe(true);
      r.run(NOD_STEPS + 2);
      expect(r.sys.menu().open).toBe(true);
      const ids = r.sys.menu().buttons.map((b) => b.id);
      r.sys.close();
      r.sys.talkTo(outer.id, 1, true);
      r.run(NOD_STEPS + 2);
      expect(r.sys.menu().buttons.map((b) => b.id)).toEqual(ids);
      r.sys.close();
    }
  });

  it('るすの 間は 一覧に なく 話しても 開かない。帰ったら また 開く', () => {
    const away = { v: false };
    const r = rig(away);
    away.v = true;
    r.run(1);
    expect(r.sys.architects().some((q) => q.id === HUT_ID)).toBe(false);
    expect(r.sys.talkTo(HUT_ID, 1, true)).toBe(false);
    expect(r.sys.talkTo(HUT_ID, 2, true)).toBe(false);
    away.v = false;
    r.run(1);
    expect(r.sys.talkTo(HUT_ID, 1, true)).toBe(true);
    r.run(NOD_STEPS + 2);
    expect(r.sys.menu().open).toBe(true);
    expect(r.sys.talkingTo(HUT_ID)).toBe(true);
  });
});
