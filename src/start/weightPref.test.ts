// START-1 AC6・AC7(おもさ): おもさ（かるい・ふつう・きれい）の 決め方と おぼえ方（仕様 §4.4）。
// 窓口の 名前（実装は これに 合わせる）: src/start/weightPref.ts の
//   WEIGHT_STORAGE_KEY = 'rikkun.weight.v1'
//   type Weight = 'light' | 'normal' | 'fine'
//   decideWeight(search: string, store: KeyValueStore | null): Weight
//      おぼえた 値（light|normal|fine）。ない・読めない・変・store が null・?nosave=1（読みにも いかない）→ 'fine'
//   saveWeight(store: KeyValueStore | null, weight: Weight): void       例外でも 止まらない
//   decideWeightedStart(o: {
//       search: string; weight: Weight;
//       env: { shadow?: string; micro?: string; ring?: string };   // VITE_SHADOW_DEFAULT・VITE_MICRO_DEFAULT・VITE_RING_DEFAULT
//       shadowStore: KeyValueStore | null;                          // rikkun.shadow.v1 の 入れ物（localStorage）
//   }): { microR: number; ring: RingSpec; shadow: ShadowStart }
//      決める 順（かげ・microR・ring それぞれ）: その 物の URL 指定（?shadow=・?microR=・?ring=）＞ E2E の 環境変数 ＞ おもさ ＞ 今の きまり。
//      light: shadow {build:false,on:false}・16・RING_SMALL / normal: 今の かげの きまり（decideShadowStart）・24・RING_FULL /
//      fine: 今の きまり（decideShadowStart・28・RING_FULL）。
import { describe, expect, it } from 'vitest';
import { decideShadowStart, SHADOW_STORAGE_KEY } from '../world/render/shadow/shadowPref';
import { DEFAULT_MICRO_R } from '../world/render/voxel/tier';
import { RING_FULL, RING_SMALL } from '../world/stream/ring';
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

describe('AC6 おもさの 中身', () => {
  it('かるい: かげを 作らない（?shadow=0 と 同じ）・microR 16・ring small', () => {
    const r = run('light');
    expect(r.shadow).toEqual({ build: false, on: false });
    expect(r.microR).toBe(16);
    expect(r.ring).toBe(RING_SMALL);
  });
  it('ふつう: かげは rikkun.shadow.v1 の きまり（なければ オン）・24・full', () => {
    const r = run('normal');
    expect(r.shadow).toEqual({ build: true, on: true });
    expect(r.microR).toBe(24);
    expect(r.ring).toBe(RING_FULL);
    expect(run('normal', '', {}, { [SHADOW_STORAGE_KEY]: 'off' }).shadow).toEqual({ build: true, on: false });
    expect(run('normal', '', {}, { [SHADOW_STORAGE_KEY]: 'on' }).shadow).toEqual({ build: true, on: true });
  });
  it('きれい: 今と 同じ（かげは 今の きまり・28・full）', () => {
    const r = run('fine');
    expect(r.shadow).toEqual({ build: true, on: true });
    expect(r.microR).toBe(28);
    expect(r.microR).toBe(DEFAULT_MICRO_R);
    expect(r.ring).toBe(RING_FULL);
    expect(run('fine', '', {}, { [SHADOW_STORAGE_KEY]: 'off' }).shadow).toEqual({ build: true, on: false });
  });
  it('ふつう・きれい の かげは decideShadowStart と 同じ（?nosave=1 で おぼえた 値を 読まない 所まで）', () => {
    for (const w of ['normal', 'fine'] as const) {
      for (const q of ['', '?nosave=1']) {
        for (const saved of [{}, { [SHADOW_STORAGE_KEY]: 'off' }, { [SHADOW_STORAGE_KEY]: 'on' }] as Array<Record<string, string>>) {
          for (const env of [undefined, 'off']) {
            const want = decideShadowStart(q, env, fakeStore(saved).store);
            expect(run(w, q, { shadow: env }, saved).shadow, `${w} ${q} ${JSON.stringify(saved)} ${env}`).toEqual(want);
          }
        }
      }
    }
  });
  it('かるい ＜ ふつう ＜ きれい の 順で 小ブロックが ふえる（16 ＜ 24 ＜ 28）。ring は かるいだけ small', () => {
    const [l, n, f] = (['light', 'normal', 'fine'] as const).map((w) => run(w));
    expect(l!.microR).toBeLessThan(n!.microR);
    expect(n!.microR).toBeLessThan(f!.microR);
    expect(l!.ring.draw).toBeLessThan(n!.ring.draw);
    expect(n!.ring).toBe(f!.ring);
  });
});

describe('AC6 URL 指定は おもさより 先', () => {
  it('light でも ?microR=24 → 24、?shadow=1 → かげ あり、?ring=full → full', () => {
    expect(run('light', '?microR=24').microR).toBe(24);
    expect(run('light', '?shadow=1').shadow).toEqual({ build: true, on: true });
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
    expect(run('light', '?menu=1&seed=3').microR).toBe(16);
  });
});

describe('AC6 E2E の 環境変数は おもさより 先（URL よりは 後）', () => {
  it('VITE_MICRO_DEFAULT=off → microR 0（おもさが なんでも）', () => {
    for (const w of ['light', 'normal', 'fine'] as const) expect(run(w, '', { micro: 'off' }).microR, w).toBe(0);
  });
  it('環境変数 off でも URL の ?microR が 先', () => {
    expect(run('fine', '?microR=28', { micro: 'off' }).microR).toBe(28);
    expect(run('light', '?microR=24', { micro: 'off' }).microR).toBe(24);
  });
  it('VITE_RING_DEFAULT=small → small（きれい でも）。?ring=full が 先', () => {
    for (const w of ['light', 'normal', 'fine'] as const) expect(run(w, '', { ring: 'small' }).ring, w).toBe(RING_SMALL);
    expect(run('fine', '?ring=full', { ring: 'small' }).ring).toBe(RING_FULL);
  });
  it('VITE_SHADOW_DEFAULT=off → かげを 作らない（ふつう・きれい でも）。?shadow=1 が 先', () => {
    for (const w of ['light', 'normal', 'fine'] as const) expect(run(w, '', { shadow: 'off' }).shadow, w).toEqual({ build: false, on: false });
    expect(run('fine', '?shadow=1', { shadow: 'off' }).shadow).toEqual({ build: true, on: true });
  });
});

describe('AC6・AC7 おもさの おぼえ方', () => {
  it('キーは rikkun.weight.v1', () => expect(WEIGHT_STORAGE_KEY).toBe('rikkun.weight.v1'));

  for (const w of ['light', 'normal', 'fine'] as const) {
    it(`おぼえた ${w} → ${w}`, () => expect(decideWeight('', fakeStore({ [WEIGHT_STORAGE_KEY]: w }).store)).toBe(w));
  }
  it('ない・変な 値・store が null → きれい（今と 同じ）', () => {
    expect(decideWeight('', fakeStore().store)).toBe('fine');
    expect(decideWeight('', fakeStore({ [WEIGHT_STORAGE_KEY]: 'abc' }).store)).toBe('fine');
    expect(decideWeight('', fakeStore({ [WEIGHT_STORAGE_KEY]: '' }).store)).toBe('fine');
    expect(decideWeight('', null)).toBe('fine');
  });
  it('読むと 例外 → きれい', () => {
    expect(decideWeight('', fakeStore({ [WEIGHT_STORAGE_KEY]: 'light' }, { readThrows: true }).store)).toBe('fine');
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
