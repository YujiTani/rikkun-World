import { describe, expect, it } from 'vitest';
import { createW2Settings, type ItemId } from '../contracts';
import { jumpHeightWith } from '../content/items/gadgetTuning';
import { legendMoveMulOf } from '../legend/defs';
import { createPlayerSettings } from '../player/config';
import { BUFF_ORDER, buffsOf, createBuffModel } from './buffIconsModel';

/** LEGEND-4 T8（§3.4・§6.6）: 天使の弓の バフ アイコン 3 つ（airJump・slowFall・safeLand の 順）・忍びの 足袋 = safeLand */
const S = createW2Settings();
const base = createPlayerSettings().jumpHeight;
const src = { moveMul: (i: ItemId | null) => legendMoveMulOf(S, i), jumpMul: (h: ItemId | null, l: ItemId | null) => jumpHeightWith(l, base, h) / base };
const ids = (held: ItemId | null, legs: ItemId | null) => buffsOf(held, legs, src).map((r) => r.id);

describe('T8 buffsOf（天使の弓）', () => {
  it('天使の弓 → airJump・slowFall・safeLand の 3 つ、この 順。mul は 1', () => {
    const rows = buffsOf('tenshi_yumi', null, src);
    expect(rows.map((r) => r.id)).toEqual(['airJump', 'slowFall', 'safeLand']);
    for (const r of rows) {
      expect(r.mul).toBe(1);
      expect(r.item).toBe('tenshi_yumi');
    }
  });
  it('忍びの 足袋だけ → safeLand 1 つ', () => {
    const rows = buffsOf(null, 'ninja_tabi', src);
    expect(rows.map((r) => r.id)).toEqual(['safeLand']);
    expect(rows[0]!.item).toBe('ninja_tabi');
  });
  it('天使の弓 ＋ 足袋 → safeLand は 1 つ（全部で 3）', () => {
    expect(ids('tenshi_yumi', 'ninja_tabi')).toEqual(['airJump', 'slowFall', 'safeLand']);
  });
  it('天使の弓 ＋ わらじ → jumpUp・airJump・slowFall・safeLand の 4 つ', () => {
    expect(ids('tenshi_yumi', 'waraji')).toEqual(['jumpUp', 'airJump', 'slowFall', 'safeLand']);
  });
  it('黒龍 ＋ 足袋 → speed・jumpUp・safeLand の 3 つ', () => {
    expect(ids('kokuryu', 'ninja_tabi')).toEqual(['speed', 'jumpUp', 'safeLand']);
  });
  it('ほかの 物 → 出ない', () => {
    expect(ids('yumi', null)).toEqual([]);
  });
  it('板の 並び（モデルの list）は あとから 出ても BUFF_ORDER の 順', () => {
    const m = createBuffModel();
    m.step(buffsOf('tenshi_yumi', null, src), false);
    const r = m.step(buffsOf('tenshi_yumi', 'waraji', src), false);
    expect(r.map((x) => x.id)).toEqual(['jumpUp', 'airJump', 'slowFall', 'safeLand']);
    expect(BUFF_ORDER).toEqual(['speed', 'jumpUp', 'airJump', 'slowFall', 'safeLand']);
  });
});
