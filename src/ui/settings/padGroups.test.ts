import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAY_BINDS } from '../../input/gamepad/mapping';
import { MENU_LABELS, PAD_GROUPS, playLabels } from './padGroups';
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
    expect(labels.find((l) => l.stick === 'stickR')?.text).toBe('みる');
  });

  it('意味が 2 つの ことばは スラッシュでつなぐ', () => {
    const t = CONTROL_ROWS.map((r) => r.label);
    expect(t).toContain('ほる/こうげき');
    expect(t).toContain('おく/たべる');
    expect(t).toContain('もちもの/クラフト');
    expect(t.some((x) => x.includes('・'))).toBe(false);
  });

  it('どの札も、まとまりのどれかに入る', () => {
    const ids = new Set(PAD_GROUPS.map((g) => g.id));
    for (const l of [...labels, ...MENU_LABELS]) expect(ids.has(l.group)).toBe(true);
  });

  it('もちもの・クラフトは 十字=えらぶ・B=きめる・A=もどる・＋=スタートメニュー', () => {
    expect(MENU_LABELS.map((l) => [l.text, l.faces.join(',')])).toEqual([
      ['えらぶ', 'dpadUp,dpadDown,dpadLeft,dpadRight'],
      ['きめる', 'faceBottom'],
      ['もどる', 'faceRight'],
      ['スタートメニュー', 'start'],
    ]);
  });
});
