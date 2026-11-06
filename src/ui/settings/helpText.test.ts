import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAY_BINDS } from '../../input/gamepad/mapping';
import { ACTION_HELP, UI_HELP, actionHelp, helpFor } from './helpText';
import { CONTROL_ROWS } from './controlRows';
import { MENU_LABELS, playLabels } from './padGroups';

/** ルビ（<ruby>…</ruby>）の外に 漢字が あれば その字を返す */
function kanjiOutsideRuby(html: string): string[] {
  const plain = html.replace(/<ruby>[\s\S]*?<\/ruby>/g, '').replace(/<[^>]+>/g, '');
  return plain.match(/[一-鿿々]/g) ?? [];
}

describe('せっていの ヘルプの文', () => {
  it('どの画面・タブ・ボタンにも 説明がある', () => {
    for (const [k, v] of Object.entries(UI_HELP)) expect(v.length, k).toBeGreaterThan(3);
  });

  it('割り当てできる そうさ（ふだ）は ぜんぶ 説明があり、「ボタンを かえられるよ」を そえる', () => {
    const actions = new Set<string>();
    for (const r of CONTROL_ROWS) {
      if (r.action && r.rebind) actions.add(r.action);
      for (const a of r.also ?? []) actions.add(a);
    }
    for (const l of playLabels(DEFAULT_PLAY_BINDS)) for (const p of l.parts) actions.add(p.action);
    for (const a of actions) {
      expect((ACTION_HELP as Record<string, string>)[a], `${a} の説明`).toBeTruthy();
      expect(helpFor(`act:${a}`)).toContain('かえられるよ');
    }
    expect(actionHelp('jump')).toContain('ジャンプ');
  });

  it('もちもの・クラフトの ふだと スティックにも 説明がある（かえられないふだは かえられると言わない）', () => {
    expect(MENU_LABELS.length).toBe(4);
    for (const k of ['menuDpad', 'menuOk', 'menuBack', 'menuStart', 'stickL', 'stickR'] as const) expect(UI_HELP[k]).toBeTruthy();
    expect(UI_HELP.menuDpad).not.toContain('かえられるよ');
  });

  it('漢字は ルビの外に ない（ひらがな・カタカナ）', () => {
    const all = [...Object.values(UI_HELP), ...Object.values(ACTION_HELP), helpFor('act:jump')];
    for (const t of all) expect(kanjiOutsideRuby(t), t).toEqual([]);
  });

  it('yuzu の 例の文', () => {
    expect(UI_HELP.tabCamera).toBe('カメラの うごく スピードを きめるよ');
    expect(UI_HELP.tabControls).toBe('ゲームの そうさの しかたを きめるよ');
    expect(UI_HELP.tabKeys).toBe('キーボードと マウスを つかって あそぶ ときの そうさの しかただよ');
    expect(UI_HELP.tabPad).toBe('ゲームパッドを つかって あそべるよ。ボタンは じぶんの すきに かえられるよ');
    expect(helpFor('ui:tabSound')).toBe('ゲームの なかで ながれる おとの おおきさを きめるよ');
  });
});
