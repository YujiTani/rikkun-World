import { describe, expect, it } from 'vitest';
import { SEEDS_20 } from '../../world/gen/mineShaftKit';
import { hookF, needYakataHook } from '../../world/gen/mineYakataKit';

/**
 * MINE-1F F16 ③〔場面〕・⑤〔動き〕（docs/design/MINE-1F.md §3.4 の 場面の 表・§3.8）。数は `yakataSoundTable()` から 読む〔ステップ ＝ 秒 × 60。#311〕。
 * 窓口〔テスト側の 読み。developer は この 形で 作る〕:
 *  - `src/fx/bgm/yakataScene.ts` の `createYakataScene(table)`〔純粋な 係。1 ステップ ごとに `tick(input)`〕:
 *      `tick({ present, chosen, katta, battle })` … present ＝ だれか 1 人でも 足が あやしい 横穴・大広間に ある〔かった あとの やかたは false として わたす〕・
 *        chosen ＝ 挑戦の 間・katta ＝ かった あと・battle ＝ ふつうの たたかいの 曲の 条件が 立って いる
 *    `event('start' | 'win' | 'lose' | 'close')` … 挑戦の はじまり・かち・まけ・ページを 閉じた／タイトルへ
 *    `state()` → `{ scene: 'none' | 'ambience' | 'waiting' | 'challenge'; fileLoops: { name: 'yakataAmbience' | 'yakataChallenge'; db: number }[]; chord: 'Dm' | null; battleMusic: boolean; bgmDuck: boolean }`
 *    `drain()` → その ステップの 頼み `{ kind: 'loop' | 'stop' | 'sfx' | 'swap' | 'back'; name: string; sec?: number }[]`〔読むと 空〕
 *      名前: loop／stop は 'yakataAmbience'・'yakataChallenge'・sfx は 'yakataGateClose'・'yakataGateOpen'・'title'〔出現音〕・'fanfare'・'chest'・'achievement'
 *  - `src/fx/yakataMotion.ts` の `yakataMotion(reduce: boolean)` → `{ gateClose: { riseTo: number; stopAt: number; dustAt: number; endAt: number }; gateOpenEnd: number; torchSwaySec: number; torchSwayAmp: number }`
 *      〔コマ。仕様 §3.8 の 数〕。動きを へらす ときは 門が 0 コマで ふさがる〔ほこり なし〕・ひらくは 0 コマ。
 */
const mods = import.meta.glob<Record<string, unknown>>('./yakataScene.ts', { eager: true });
const motions = import.meta.glob<Record<string, unknown>>('../yakataMotion.ts', { eager: true });
interface Req { kind: string; name: string; sec?: number }
interface St { scene: string; fileLoops: { name: string; db: number }[]; chord: string | null; battleMusic: boolean; bgmDuck: boolean }
interface Scene {
  tick(i: { present: boolean; chosen: boolean; katta: boolean; battle: boolean }): void;
  event(e: 'start' | 'win' | 'lose' | 'close'): void;
  state(): St;
  drain(): Req[];
}
const table = () => {
  const h = hookF(SEEDS_20[0]!);
  needYakataHook(h, ['yakataSoundTable']);
  return h.yakataSoundTable();
};
const make = (): Scene => {
  const f = Object.values(mods)[0]?.['createYakataScene'] as ((t: unknown) => Scene) | undefined;
  if (!f) throw new Error('窓口が まだ ない: src/fx/bgm/yakataScene.ts');
  return f(table());
};
interface Inp { present: boolean; chosen: boolean; katta: boolean; battle: boolean }
const IDLE: Inp = { present: false, chosen: false, katta: false, battle: false };
/** n ステップ 回して、ステップ番号つきの 頼みを あつめる */
function run(s: Scene, n: number, inp: Inp, t0 = 0): { at: number; r: Req }[] {
  const out: { at: number; r: Req }[] = [];
  for (let i = 0; i < n; i++) {
    s.tick(inp);
    for (const r of s.drain()) out.push({ at: t0 + i, r });
  }
  return out;
}
const names = (s: Scene): string[] => s.state().fileLoops.map((l) => l.name).sort();

describe('F16 ③ 場面', () => {
  it('入る: ふんいき〔ambience〕・swapSec で 入れかえ・出ると もとの BGM へ backSec・かった あとは 鳴らさない', () => {
    const T = table();
    const s = make();
    const a = run(s, 5, { ...IDLE, present: true });
    expect(s.state().scene).toBe('ambience');
    expect(names(s)).toEqual(['yakataAmbience']);
    expect(s.state().fileLoops[0]!.db, 'ふんいき だけの ときは 0 dB').toBe(0);
    expect(a.some((x) => x.r.kind === 'swap' && x.r.sec === T.swapSec)).toBe(true);
    const b = run(s, 5, IDLE);
    expect(s.state().scene).toBe('none');
    expect(names(s)).toEqual([]);
    expect(b.some((x) => x.r.kind === 'back' && x.r.sec === T.backSec)).toBe(true);
    const k = make();
    run(k, 30, { ...IDLE, katta: true });
    expect(k.state().scene, 'かった あとは 鳴らさない').toBe('none');
  });

  it('はじまり: 同じ ステップで ずずん ＋ 出現音 1 回・waiting の 間は ふんいきの まま・challengeDelaySec × 60 の ちょうど の ステップで 挑戦の 曲・ふんいきは ambienceUnderDb', () => {
    const T = table();
    const s = make();
    run(s, 3, { ...IDLE, present: true });
    s.event('start');
    const delay = Math.round(T.challengeDelaySec * 60);
    const reqs = run(s, delay + 120, { present: true, chosen: true, katta: false, battle: true });
    const gate = reqs.filter((x) => x.r.name === 'yakataGateClose');
    const title = reqs.filter((x) => x.r.name === 'title');
    expect(gate, 'ずずん 1 回').toHaveLength(1);
    expect(title, '出現音 1 回').toHaveLength(1);
    expect(gate[0]!.at, '同じ ステップ').toBe(title[0]!.at);
    const loop = reqs.find((x) => x.r.kind === 'loop' && x.r.name === 'yakataChallenge');
    expect(loop, '挑戦の 曲').toBeDefined();
    expect(loop!.at - gate[0]!.at, 'ちょうど challengeDelaySec × 60').toBe(delay);
    expect(loop!.r.sec).toBe(T.challengeFadeSec);
    expect(names(s)).toEqual(['yakataAmbience', 'yakataChallenge']);
    expect(s.state().fileLoops.find((l) => l.name === 'yakataAmbience')!.db).toBe(T.ambienceUnderDb);
    expect(s.state().fileLoops.find((l) => l.name === 'yakataChallenge')!.db).toBe(0);
    expect(s.state().chord, 'やかたの 間は Dm').toBe('Dm');
  });

  it('waiting の 間は 7 ひきが 追いかけても たたかいの 曲に ならない・挑戦の 場面は たたかいの 曲より 先', () => {
    const T = table();
    const s = make();
    run(s, 2, { ...IDLE, present: true });
    s.event('start');
    const delay = Math.round(T.challengeDelaySec * 60);
    const inp = { present: true, chosen: true, katta: false, battle: true };
    run(s, delay - 1, inp);
    expect(s.state().scene).toBe('waiting');
    expect(s.state().battleMusic, 'waiting の 間').toBe(false);
    run(s, 200, inp);
    expect(s.state().scene).toBe('challenge');
    expect(s.state().battleMusic, '挑戦の 間は たたかいの 曲より 先').toBe(false);
  });

  it('曲の 前に かち・まけ・ページを 閉じた ときは 挑戦の 曲を 頼まない', () => {
    for (const e of ['win', 'lose', 'close'] as const) {
      const s = make();
      run(s, 2, { ...IDLE, present: true });
      s.event('start');
      const before = run(s, 30, { present: true, chosen: true, katta: false, battle: false });
      s.event(e);
      const after = run(s, 400, e === 'win' ? { present: false, chosen: false, katta: true, battle: false } : { present: true, chosen: false, katta: false, battle: false }, 30);
      expect([...before, ...after].filter((x) => x.r.kind === 'loop' && x.r.name === 'yakataChallenge'), `${e}: 曲を 頼んで いない`).toHaveLength(0);
    }
  });

  it('かち: 曲・ふんいきを endFadeSec で 消す → 門 ひらく・ファンファーレ → 宝箱は ファンファーレの chestAfterFanfareSec あと → 実績は その あと・大きな 音は 同じ ステップに ならない・今の BGM へ', () => {
    const T = table();
    const s = make();
    run(s, 2, { ...IDLE, present: true });
    s.event('start');
    run(s, Math.round(T.challengeDelaySec * 60) + 90, { present: true, chosen: true, katta: false, battle: false });
    expect(names(s)).toHaveLength(2);
    s.event('win');
    const w = run(s, 600, { present: true, chosen: false, katta: true, battle: false });
    const stops = w.filter((x) => x.r.kind === 'stop');
    expect(stops.map((x) => x.r.name).sort()).toEqual(['yakataAmbience', 'yakataChallenge']);
    for (const x of stops) expect(x.r.sec).toBe(T.endFadeSec);
    const at = (n: string): number => w.find((x) => x.r.name === n)?.at ?? -1;
    expect(at('yakataGateOpen'), 'ひらく 音').toBeGreaterThanOrEqual(0);
    expect(at('fanfare'), 'ファンファーレ').toBeGreaterThanOrEqual(0);
    expect(at('chest') - at('fanfare'), 'ファンファーレ → 宝箱').toBe(Math.round(T.chestAfterFanfareSec * 60));
    expect(at('achievement'), '実績は 宝箱の あと').toBeGreaterThan(at('chest'));
    const big = [at('fanfare'), at('chest'), at('achievement')];
    expect(new Set(big).size, '大きな 音は 1 つずつ').toBe(3);
    expect(s.state().scene).toBe('none');
    expect(w.some((x) => x.r.kind === 'back'), '今の BGM へ').toBe(true);
    expect(w.some((x) => /sad|kanashii/.test(x.r.name)), 'かなしい 曲なし').toBe(false);
  });

  it('まけ: 曲を endFadeSec で 消す・ひらく 音・かなしい 曲なし・BGM を 暗く しない', () => {
    const T = table();
    const s = make();
    run(s, 2, { ...IDLE, present: true });
    s.event('start');
    run(s, Math.round(T.challengeDelaySec * 60) + 90, { present: true, chosen: true, katta: false, battle: false });
    s.event('lose');
    const l = run(s, 300, { present: true, chosen: false, katta: false, battle: false });
    expect(l.filter((x) => x.r.name === 'yakataChallenge' && x.r.kind === 'stop').map((x) => x.r.sec)).toEqual([T.endFadeSec]);
    expect(l.some((x) => x.r.name === 'yakataGateOpen')).toBe(true);
    expect(l.some((x) => /sad|kanashii/.test(x.r.name))).toBe(false);
    expect(s.state().bgmDuck, 'BGM を 暗く しない').toBe(false);
  });

  it('2 人あそび: 1 人でも 足が あれば 鳴る・だれも いなく なれば もとの BGM', () => {
    const s = make();
    run(s, 3, { ...IDLE, present: true });
    expect(s.state().scene).toBe('ambience');
    run(s, 3, IDLE);
    expect(s.state().scene).toBe('none');
  });
});

describe('F16 ⑤ 動き〔§3.8〕', () => {
  const motion = (reduce: boolean) => {
    const f = Object.values(motions)[0]?.['yakataMotion'] as ((r: boolean) => { gateClose: { riseTo: number; stopAt: number; dustAt: number; endAt: number }; gateOpenEnd: number; torchSwaySec: number; torchSwayAmp: number }) | undefined;
    if (!f) throw new Error('窓口が まだ ない: src/fx/yakataMotion.ts');
    return f(reduce);
  };
  it('門が ふさがる: 30 コマで とまる〔ず〕・38 コマで ほこり〔ずん〕・50 コマで おわり。ひらく: 18 コマ〔仕様 §3.8 の 数〕', () => {
    const m = motion(false);
    expect([m.gateClose.stopAt, m.gateClose.dustAt, m.gateClose.endAt, m.gateOpenEnd]).toEqual([30, 38, 50, 18]);
  });
  it('たいまつの ゆれは 2 秒 以上・ふれはば ±15% いない', () => {
    const m = motion(false);
    expect(m.torchSwaySec).toBeGreaterThanOrEqual(2);
    expect(m.torchSwayAmp).toBeLessThanOrEqual(0.15);
  });
  it('動きを へらす: 門は 0 コマで ふさがる〔ほこり なし〕・ひらくも 0 コマ', () => {
    const m = motion(true);
    expect(m.gateClose.endAt).toBe(0);
    expect(m.gateClose.dustAt).toBe(0);
    expect(m.gateOpenEnd).toBe(0);
  });
});
