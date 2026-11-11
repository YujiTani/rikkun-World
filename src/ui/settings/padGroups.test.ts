import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAY_BINDS } from '../../input/gamepad/mapping';
import { MENU_LABELS, PAD_BODY_TOP, PAD_GROUPS, playLabels } from './padGroups';
import { CONTROL_ROWS } from './controlRows';

describe('ゲームパッドの札', () => {
  const labels = playLabels(DEFAULT_PLAY_BINDS);

  it('同じ意味の札は 1 まいだけ（できごとは − と 十字の左で 1 まい）', () => {
    const texts = labels.map((l) => l.text);
    expect(new Set(texts).size).toBe(texts.length);
    const log = labels.find((l) => l.action === 'openLog')!;
    expect(log.faces).toEqual(['select', 'dpadLeft']);
    expect(texts.filter((t) => t === 'できごと')).toHaveLength(1);
  });

  it('割り当てのない面（あき）は札にしない。スティックは出す', () => {
    expect(labels.some((l) => l.text === 'あき')).toBe(false);
    expect(labels.find((l) => l.stick === 'stickL')?.text).toBe('あるく');
    expect(labels.find((l) => l.stick === 'stickR')?.text).toBe('カメラを うごかす');
  });

  it('意味が 2 つの ことばは スラッシュでつなぐ', () => {
    const t = CONTROL_ROWS.map((r) => r.label);
    expect(t).toContain('ほる/こうげき');
    expect(t).toContain('おく/たべる');
    expect(t).toContain('もちもの/クラフト');
    expect(t.some((x) => x.includes('・'))).toBe(false);
  });

  it('できごとは − の札に まとまり、十字の左の札は出ない', () => {
    expect(labels.find((l) => l.action === 'openLog')!.group).toBe('minus');
    expect(PAD_GROUPS.find((g) => g.id === 'minus')!.side).toBe('topLeft');
  });

  it('L と R は ことばが同じなので 1 まいにまとめ、割り当ては 1 つずつ', () => {
    const hot = labels.filter((l) => l.text === 'てにもつを きりかえる');
    expect(hot).toHaveLength(1);
    expect(hot[0]!.parts.map((p) => [p.action, p.faces.join()])).toEqual([['hotbarPrev', 'l1'], ['hotbarNext', 'r1']]);
    expect(labels.find((l) => l.action === 'toggleView')?.text).toBe('カメラ きりかえ');
  });

  it('図は 左右対称: 十字と ABXY・左右のスティックは 同じ高さで、まんなか（x=360）をはさんで 同じきょり', () => {
    const g = (id: string) => PAD_GROUPS.find((x) => x.id === id)!;
    const mid = (id: string) => ({ x: g(id).box.x + g(id).box.w / 2, y: g(id).box.y + g(id).box.h / 2 });
    for (const [l, r] of [['dpad', 'abxy'], ['stickL', 'stickR'], ['zl', 'zr']] as const) {
      expect(mid(l).y).toBe(mid(r).y);
      expect(360 - mid(l).x).toBe(mid(r).x - 360);
    }
  });

  it('どの札も、まとまりのどれかに入る', () => {
    const ids = new Set(PAD_GROUPS.map((g) => g.id));
    for (const l of [...labels, ...MENU_LABELS]) expect(ids.has(l.group)).toBe(true);
  });

  it('肩ボタンと 本体の あいだは 50px ほど（図の座標で 90）あいている。− ＋ は 本体のまんなか', () => {
    const zl = PAD_GROUPS.find((g) => g.id === 'zl')!;
    expect(PAD_BODY_TOP - (zl.box.y + zl.box.h)).toBeGreaterThanOrEqual(90);
    const minus = PAD_GROUPS.find((g) => g.id === 'minus')!;
    const plus = PAD_GROUPS.find((g) => g.id === 'plus')!;
    const dpad = PAD_GROUPS.find((g) => g.id === 'dpad')!;
    const abxy = PAD_GROUPS.find((g) => g.id === 'abxy')!;
    expect(minus.box.x).toBeGreaterThan(dpad.box.x + dpad.box.w);
    expect(plus.box.x + plus.box.w).toBeLessThan(abxy.box.x);
    expect(minus.box.x + minus.box.w).toBeLessThanOrEqual(plus.box.x);
  });

  it('もちもの・クラフトは 十字=えらぶ・B=きめる・A=もどる・X=すてる・R3=ぜんぶ すてる・Y=とじる・＋=スタートメニュー', () => {
    expect(MENU_LABELS.map((l) => [l.text, l.faces.join(',')])).toEqual([
      ['えらぶ', 'dpadUp,dpadDown,dpadLeft,dpadRight'],
      ['きめる', 'faceBottom'],
      ['もどる', 'faceRight'],
      ['1こ すてる', 'faceTop'],
      ['ぜんぶ すてる', 'r3'],
      ['とじる', 'faceLeft'],
      ['スタートメニュー', 'start'],
    ]);
  });
});
