import { describe, expect, it } from 'vitest';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { techCell } from '../tools/blade/advance';
import { gnomeSpriteBlade } from './gnomeSprite';
import { GNOME_SWEEP_CURVE, GNOME_SWEEP_PHASES } from './techCurves';

/** LEGEND-4 G8（見た目の もと）: 斧の 絵 14 コマが ゲームの 46 ステップに うまく のる */
const T = LEGEND4_TUNING.gnome;
const lengths = { startup: T.startup, active: T.active, recovery: T.recovery };
describe('ノームの斧の コマ', () => {
  it('絵の 時間割は 14 コマ・14 / 8 / 30（合計 52）', () => {
    expect(GNOME_SWEEP_CURVE.ticks).toHaveLength(14);
    expect(GNOME_SWEEP_CURVE.ticks.reduce((a, b) => a + b, 0)).toBe(52);
    expect(GNOME_SWEEP_PHASES).toEqual({ startup: 14, active: 8, recovery: 30 });
  });
  it('F1 = 1 コマ目・当たり F13 = 当たりの コマ（5 コマ目）・F46 = さいごの コマ。コマは もどらない', () => {
    const cell = (f: number) => techCell(GNOME_SWEEP_CURVE, GNOME_SWEEP_PHASES, lengths, f);
    expect(cell(1)).toBe(0);
    expect(cell(T.startup + 1)).toBe(4);
    expect(cell(T.startup + T.active + T.recovery)).toBe(13);
    for (let f = 2; f <= 46; f++) expect(cell(f)).toBeGreaterThanOrEqual(cell(f - 1));
  });
  it('入力: ふって いない 間は かまえ（tech なし）・sweep が なければ null', () => {
    expect(gnomeSpriteBlade(undefined)).toBeNull();
    expect(gnomeSpriteBlade({ phase: 'idle', frame: 0 })).toMatchObject({ stance: 'chudan', tech: null, lengths: null });
    expect(gnomeSpriteBlade({ phase: 'active', frame: 13 })).toMatchObject({ tech: 'thrust', phase: 'active', frame: 13, lengths });
  });
});
