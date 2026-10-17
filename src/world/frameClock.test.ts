import { describe, expect, it } from 'vitest';
import * as mod from './frameClock';

/**
 * #179（docs/tickets/E2E-179.md）: 1 コマの仕事の量を「本当の時間（ms）」か「数」で決める。
 * 実装の前に書いたテスト（落ちるのが正しい）。
 * 決める順: URL の ?clock=time|count > 環境変数 VITE_FRAME_CLOCK が count なら 'count' > 'time'。
 * URL のほかの値・空は 無いのと同じ。
 */
type Decide = (search: string, envDefault: string | undefined) => 'time' | 'count';
const decide: Decide = (search, envDefault) => {
  const f = (mod as unknown as { decideFrameClock?: Decide }).decideFrameClock;
  if (typeof f !== 'function') throw new Error('decideFrameClock(search, envDefault) を src/world/frameClock.ts に作って export する（まだ作っていない。#179）');
  return f(search, envDefault);
};

describe('#179 decideFrameClock', () => {
  it('URL も環境変数もなければ time（ふつうに遊ぶとき）', () => {
    expect(decide('', undefined)).toBe('time');
    expect(decide('?nosave=1', undefined)).toBe('time');
  });

  it('環境変数 VITE_FRAME_CLOCK=count なら count（E2E のサーバー）', () => {
    expect(decide('', 'count')).toBe('count');
    expect(decide('?nosave=1', 'count')).toBe('count');
  });

  it('環境変数が count 以外（time・空・ほかの値）なら time', () => {
    expect(decide('', 'time')).toBe('time');
    expect(decide('', '')).toBe('time');
    expect(decide('', 'foo')).toBe('time');
  });

  it('URL の ?clock=time|count は 環境変数より強い', () => {
    expect(decide('?clock=time', 'count')).toBe('time');
    expect(decide('?clock=count', undefined)).toBe('count');
    expect(decide('?clock=count', 'time')).toBe('count');
    expect(decide('?nosave=1&clock=time', 'count')).toBe('time');
    expect(decide('?clock=count&nosave=1', undefined)).toBe('count');
  });

  it('URL のほかの値・空は 無いのと同じ', () => {
    expect(decide('?clock=foo', 'count')).toBe('count');
    expect(decide('?clock=', 'count')).toBe('count');
    expect(decide('?clock=foo', undefined)).toBe('time');
    expect(decide('?clock=', undefined)).toBe('time');
  });

  it('数の予算の定数がある（メッシュ 8・小ブロック 1・合計 256、光 64）', () => {
    const m = mod as unknown as Record<string, unknown>;
    const vals = Object.values(m).filter((v) => typeof v === 'number');
    for (const n of [8, 1, 256, 64]) expect(vals, `定数 ${n}`).toContain(n);
  });
});
