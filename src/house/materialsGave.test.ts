import { describe, expect, it } from 'vitest';
import { emptyState } from './editor/model';
import { createSheetPort } from './editor/sheet';
import { houseRig } from './houseRig';
import { makeStock } from './stockKit';
import { NOD_STEPS } from './architect';

/** 1E 軽微: 前の くらを かえした 種類ごとに gave（拾った ログ・音と 同じ 道）／たんすの ふでの たいきゅうは 今の 設定から */
describe('くらを かえした ときの gave', () => {
  it('もどせた 種類ごとに 1 回（もどせなかった 種類は 呼ばない）', () => {
    const r = houseRig();
    r.sys.state.record.toolsGiven = true;
    r.sys.state.record.fudeGiven = true;
    r.sys.load({ ...r.sys.serialize(), kura: { log: 10, stone: 5 }, toolsGiven: true, fudeGiven: true });
    r.run(1);
    for (let i = 0; i < r.bag.size; i++) r.bag.setSlot(i, i < r.bag.size - 1 ? { item: 'dirt', count: 64 } : null); // 空き 1 マス
    r.calls.length = 0;
    r.sys.talkTo(r.sys.architects().at(-1)!.id);
    r.run(NOD_STEPS);
    expect(r.calls.filter((c) => c.startsWith('gave:'))).toEqual(['gave:stone']);
  });
});

describe('ふでの 新品の たいきゅうは 設定から', () => {
  it('設定が 10 なら たんすの ふで（wear 1）の のこりは 9 → 使うと wear 2', () => {
    const st = makeStock();
    st.bag.add('paper', 1);
    const at = st.putTansu(5, 0, {});
    st.storage.set(at.x, at.y, at.z, 0, { item: 'fude', count: 1, wear: 1 });
    const port = createSheetPort({ bag: st.bag, craft: st.craft, tansu: st.storage, durability: () => ({ fude: 10 }), register: () => 1 });
    port.make(emptyState());
    expect(st.storage.get(at.x, at.y, at.z)?.slots[0]).toMatchObject({ item: 'fude', wear: 2 });
  });
});
