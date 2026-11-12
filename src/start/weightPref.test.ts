// START-1 AC6・AC7(おもさ)・GFX-1 G1・G2: おもさ（4 だん）の 決め方と おぼえ方。
//   おもさの 表は src/start/gfxPref.ts の WEIGHT_SPEC。
//   decideWeight: ない・読めない・変 → 'light'（GFX-1 の 新しい 既定）。?nosave=1（読みにも いかない）→ 'fine'。
//   decideWeightedStart: 決める 順 = URL ＞ E2E の 環境変数 ＞ くわしくの 保存 ＞ おもさ。
import { describe, expect, it } from 'vitest';
import { SHADOW_STORAGE_KEY } from '../world/render/shadow/shadowPref';
import { DEFAULT_MICRO_R } from '../world/render/voxel/tier';
import { RING_FULL, RING_SMALL } from '../world/stream/ring';
import { GFX_STORAGE_KEY, WEIGHTS } from './gfxPref';
import { WEIGHT_STORAGE_KEY, decideWeight, decideWeightedStart, saveWeight, type Weight } from './weightPref';

function fakeStore(initial: Record<string, string> = {}, opts: { readThrows?: boolean; writeThrows?: boolean } = {}) {
  const data = new Map(Object.entries(initial));
  const reads: string[] = [];
  const writes: string[] = [];
  return {
    data,
    reads,
    writes,
    store: {
      getItem: (k: string) => {
        reads.push(k);
        if (opts.readThrows) throw new Error('denied');
        return data.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (opts.writeThrows) throw new Error('quota');
        writes.push(`${k}=${v}`);
        data.set(k, v);
      },
    },
  };
}

const run = (weight: Weight, search = '', env: { shadow?: string; micro?: string; ring?: string } = {}, shadowSaved: Record<string, string> = {}) => {
  const f = fakeStore(shadowSaved);
  return decideWeightedStart({ search, weight, env, shadowStore: f.store });
};

describe('AC6・G2 おもさの 中身', () => {
  it('とても かるい: かげなし・microR 0・ring small・がめん 1', () => {
    const r = run('xlight');
    expect(r.shadow).toEqual({ build: false, on: false });
    expect([r.microR, r.res]).toEqual([0, 1]);
    expect(r.ring).toBe(RING_SMALL);
  });
  it('かるい: かげなし（あとから 作れる）・microR 12・ring small・がめん 1.5', () => {
    const r = run('light');
    expect(r.shadow).toEqual({ build: false, on: false });
    expect(r.shadowAllowed).toBe(true);
    expect([r.microR, r.res]).toEqual([12, 1.5]);
    expect(r.ring).toBe(RING_SMALL);
  });
  it('ふつう: かげ あり（保存が あれば それ）・24・full・がめん 2', () => {
    const r = run('normal');
    expect(r.shadow).toEqual({ build: true, on: true });
    expect([r.microR, r.res]).toEqual([24, 2]);
    expect(r.ring).toBe(RING_FULL);
    expect(run('normal', '', {}, { [SHADOW_STORAGE_KEY]: 'off' }).shadow).toEqual({ build: false, on: false });
    expect(run('normal', '', {}, { [SHADOW_STORAGE_KEY]: 'on' }).shadow).toEqual({ build: true, on: true });
  });
  it('きれい: かげ あり・28・full・がめん 2', () => {
    const r = run('fine');
    expect(r.shadow).toEqual({ build: true, on: true });
    expect([r.microR, r.res]).toEqual([28, 2]);
    expect(r.microR).toBe(DEFAULT_MICRO_R);
    expect(r.ring).toBe(RING_FULL);
  });
  it('かるい でも かげの 保存が on なら オンで 始まる（くわしくの 保存が おもさより 先）', () => {
    expect(run('light', '', {}, { [SHADOW_STORAGE_KEY]: 'on' }).shadow).toEqual({ build: true, on: true });
  });
  it('くわしくの 保存（rikkun.gfx.v1）は おもさより 先。?nosave=1 では 読まない', () => {
    const saved = { [GFX_STORAGE_KEY]: '{"res":1,"micro":8}' };
    const r = run('fine', '', {}, saved);
    expect([r.microR, r.res]).toEqual([8, 1]);
    const n = run('fine', '?nosave=1', {}, saved);
    expect([n.microR, n.res]).toEqual([28, 2]);
  });
  it('くわしくの 保存が こわれて いても 止まらない（おもさの 値）', () => {
    const r = run('light', '', {}, { [GFX_STORAGE_KEY]: '{oops' });
    expect([r.microR, r.res]).toEqual([12, 1.5]);
    const r2 = run('light', '', {}, { [GFX_STORAGE_KEY]: '{"res":3,"micro":13}' });
    expect([r2.microR, r2.res]).toEqual([12, 1.5]);
  });
  it('?nosave=1 では かげの 保存も 読まない（きれい → オン）', () => {
    expect(run('fine', '?nosave=1', {}, { [SHADOW_STORAGE_KEY]: 'off' }).shadow).toEqual({ build: true, on: true });
  });
  it('おもさが 重く なる ほど microR・がめんが ふえる（xlight ＜ light ＜ normal ＜ fine）。ring は かるい 2 つが small', () => {
    const [x, l, n, f] = WEIGHTS.map((w) => run(w));
    expect(x!.microR).toBeLessThan(l!.microR);
    expect(l!.microR).toBeLessThan(n!.microR);
    expect(n!.microR).toBeLessThan(f!.microR);
    expect(x!.res).toBeLessThan(l!.res);
    expect(l!.res).toBeLessThan(n!.res);
    expect(x!.ring).toBe(l!.ring);
    expect(l!.ring.draw).toBeLessThan(n!.ring.draw);
    expect(n!.ring).toBe(f!.ring);
  });
});

describe('G2 ?res= は おもさ・保存より 先', () => {
  it('?res=1|1.5|2 が 勝つ。ほかの 値は 無視', () => {
    expect(run('fine', '?res=1').res).toBe(1);
    expect(run('xlight', '?res=2').res).toBe(2);
    expect(run('fine', '?res=1.5', {}, { [GFX_STORAGE_KEY]: '{"res":1}' }).res).toBe(1.5);
    expect(run('fine', '?res=3').res).toBe(2);
    expect(run('fine', '?res=').res).toBe(2);
  });
});

describe('AC6 URL 指定は おもさより 先', () => {
  it('light でも ?microR=24 → 24、?shadow=1 → かげ あり、?ring=full → full', () => {
    expect(run('light', '?microR=24').microR).toBe(24);
    expect(run('light', '?shadow=1').shadow).toEqual({ build: true, on: true });
    expect(run('light', '?shadow=0').shadowAllowed).toBe(false);
    expect(run('light', '?ring=full').ring).toBe(RING_FULL);
    expect(run('light', '?microR=0').microR).toBe(0);
  });
  it('light の まま 指定のない 物は かるいの まま（?microR=24 でも かげ・ring は かるい）', () => {
    const r = run('light', '?microR=24');
    expect(r.shadow).toEqual({ build: false, on: false });
    expect(r.ring).toBe(RING_SMALL);
  });
  it('normal・fine でも URL が 先: ?microR=16・?ring=small・?shadow=0', () => {
    for (const w of ['normal', 'fine'] as const) {
      expect(run(w, '?microR=16').microR).toBe(16);
      expect(run(w, '?ring=small').ring).toBe(RING_SMALL);
      expect(run(w, '?shadow=0').shadow).toEqual({ build: false, on: false });
    }
  });
  it('おもさと 関係ない 指定（?menu=1・?seed=3）は 無視', () => {
    expect(run('light', '?menu=1&seed=3').microR).toBe(12);
  });
});

describe('AC6 E2E の 環境変数は おもさより 先（URL よりは 後）', () => {
  it('VITE_MICRO_DEFAULT=off → microR 0（おもさが なんでも）', () => {
    for (const w of WEIGHTS) expect(run(w, '', { micro: 'off' }).microR, w).toBe(0);
  });
  it('環境変数 off でも URL の ?microR が 先', () => {
    expect(run('fine', '?microR=28', { micro: 'off' }).microR).toBe(28);
    expect(run('light', '?microR=24', { micro: 'off' }).microR).toBe(24);
  });
  it('VITE_RING_DEFAULT=small → small（きれい でも）。?ring=full が 先', () => {
    for (const w of WEIGHTS) expect(run(w, '', { ring: 'small' }).ring, w).toBe(RING_SMALL);
    expect(run('fine', '?ring=full', { ring: 'small' }).ring).toBe(RING_FULL);
  });
  it('VITE_SHADOW_DEFAULT=off → かげを 作らない（ふつう・きれい でも）。?shadow=1 が 先', () => {
    for (const w of WEIGHTS) expect(run(w, '', { shadow: 'off' }).shadow, w).toEqual({ build: false, on: false });
    expect(run('fine', '?shadow=1', { shadow: 'off' }).shadow).toEqual({ build: true, on: true });
  });
});

describe('AC6・AC7 おもさの おぼえ方', () => {
  it('キーは rikkun.weight.v1', () => expect(WEIGHT_STORAGE_KEY).toBe('rikkun.weight.v1'));

  for (const w of WEIGHTS) {
    it(`おぼえた ${w} → ${w}`, () => expect(decideWeight('', fakeStore({ [WEIGHT_STORAGE_KEY]: w }).store)).toBe(w));
  }
  it('ない・変な 値・store が null → かるい（GFX-1 の 新しい 既定）', () => {
    expect(decideWeight('', fakeStore().store)).toBe('light');
    expect(decideWeight('', fakeStore({ [WEIGHT_STORAGE_KEY]: 'abc' }).store)).toBe('light');
    expect(decideWeight('', fakeStore({ [WEIGHT_STORAGE_KEY]: '' }).store)).toBe('light');
    expect(decideWeight('', null)).toBe('light');
  });
  it('読むと 例外 → かるい', () => {
    expect(decideWeight('', fakeStore({ [WEIGHT_STORAGE_KEY]: 'fine' }, { readThrows: true }).store)).toBe('light');
  });
  it('?nosave=1 → きれい。おぼえた 値を 読みにも いかない', () => {
    const f = fakeStore({ [WEIGHT_STORAGE_KEY]: 'light' });
    expect(decideWeight('?nosave=1', f.store)).toBe('fine');
    expect(f.reads).toEqual([]);
  });
  it('saveWeight は すぐ 書く。かげの おぼえた 値（rikkun.shadow.v1）は 書きかえない', () => {
    const f = fakeStore({ [SHADOW_STORAGE_KEY]: 'on' });
    saveWeight(f.store, 'light');
    expect(f.data.get(WEIGHT_STORAGE_KEY)).toBe('light');
    expect(f.data.get(SHADOW_STORAGE_KEY)).toBe('on');
    expect(f.writes).toEqual([`${WEIGHT_STORAGE_KEY}=light`]);
  });
  it('おもさを かえても かげの 設定は のこる: decideWeightedStart は store に 書かない', () => {
    const f = fakeStore({ [SHADOW_STORAGE_KEY]: 'off' });
    decideWeightedStart({ search: '', weight: 'light', env: {}, shadowStore: f.store });
    expect(f.writes).toEqual([]);
  });
  it('書くと 例外でも 止まらない・store が null でも 止まらない', () => {
    expect(() => saveWeight(fakeStore({}, { writeThrows: true }).store, 'normal')).not.toThrow();
    expect(() => saveWeight(null, 'normal')).not.toThrow();
  });
});
