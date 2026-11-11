import { describe, expect, it } from 'vitest';
import { hintRows } from './inventoryHints';

const words = (o: Parameters<typeof hintRows>[0]): string => hintRows(o).map(([a, b]) => `${a}|${b}`).join('\n');

describe('もちもの画面の ヘルプ帯', () => {
  it('キーボードは Q・E の 案内、パッドは 十字・つかむ・すてる・とじる の 案内', () => {
    expect(words({ tansu: false, duo: false })).toContain('inv-key');
    const pad = words({ tansu: false, duo: false, pad: true });
    for (const w of ['えらぶ', 'つかむ・おく', '1こ すてる', 'ぜんぶ すてる', 'とじる']) expect(pad).toContain(w);
    expect(pad).not.toContain('inv-key');
    expect(hintRows({ tansu: false, duo: false, pad: true })[0]![0]).toContain('<svg'); // 十字の 絵
  });
  it('つくる・やく の 帯（パッドは B、キーは クリック）', () => {
    expect(words({ tansu: false, duo: true, pad: true, kind: 'craft' })).toContain('つくる');
    expect(words({ tansu: false, duo: true, pad: true, kind: 'bake' })).toContain('やく');
    expect(words({ tansu: false, duo: true, kind: 'craft' })).toContain('クリック');
  });
  it('2 人用の パッド（1P・2P とも）: 「1こ すてる」「ぜんぶ すてる」を 出す。drop=false の ときは 出さない', () => {
    const duo = words({ tansu: false, duo: true, pad: true });
    expect(duo).toContain('1こ すてる');
    expect(duo).toContain('ぜんぶ すてる');
    expect(words({ tansu: false, duo: true, pad: true, drop: false })).not.toContain('すてる');
  });
});
