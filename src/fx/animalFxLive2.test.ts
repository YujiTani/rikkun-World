import { describe, expect, it } from 'vitest';
import type { AnimalEvent, AnimalView, CoopInfo, KitInfo } from '../contracts';
import { ANIMAL_FX, AnimalFx, TILE, TILE_COUNT } from './animalFx';
import type { Tone } from './sound';

const view = (id: number, o: Partial<AnimalView> = {}): AnimalView => ({
  id, x: 0, y: 9, z: 0, yaw: 0, headYaw: 0, state: 'idle', stateTicks: 0, friend: false, hearts: 0, targeted: false, ...o,
});
function make(motion = 1) {
  const m = { v: motion };
  const fx = new AnimalFx({ sound: { playTones: (_t: readonly Tone[]) => undefined }, motion: () => m.v });
  return { fx, m };
}
const ev = (...e: AnimalEvent[]) => e;
const eye = { x: 0, y: 9, z: 5 };
const out = () => ({ pos: new Float32Array(3 * 64), col: new Float32Array(3 * 64), size: new Float32Array(64), tile: new Float32Array(64) });

describe('LIVE-2 つぶ・絵の 番号', () => {
  it('絵の 並び: Z・いえ の しるし 4 まいが 後ろに ふえた（LIVE-1 の 番号は そのまま）', () => {
    expect(TILE).toMatchObject({ heartFull: 0, heartEmpty: 1, star: 2, dot: 3, footFull: 4, footEmpty: 5, belly: 6, zzz: 7, houseEmpty: 8, house1: 9, house2: 10, house3: 11 });
    expect(TILE_COUNT).toBe(12);
  });
});

describe('かえる（§3.5・§3.6・§3.7）', () => {
  it('hatchStart のあと 20 ステップ 目に から の かけら 6（shell は ふえる だけ・fxReset で 0）。音は ふつう の hatch 1 回', () => {
    const { fx } = make();
    fx.step([], eye);
    fx.onEvents(ev({ type: 'hatchStart', x: 3, y: 9, z: 4 }));
    expect(fx.fx().shell).toBe(0);
    for (let i = 0; i < 19; i++) fx.step([], eye);
    expect(fx.fx().shell).toBe(0);
    expect(fx.particles.active(6)).toBe(0);
    fx.step([], eye);
    expect(fx.fx().shell).toBe(ANIMAL_FX.shell);
    expect(fx.particles.active(6)).toBe(6);
    expect(fx.played.filter((n) => n === 'hatch')).toHaveLength(1);
    fx.onEvents(ev({ type: 'hatch', id: 1, breed: 'normal', gold: false, first: false }));
    expect(fx.played.filter((n) => n === 'hatch')).toHaveLength(1); // 二重に ならさない
    fx.fxReset();
    expect(fx.fx().shell).toBe(0);
  });

  it('同じ ステップ の hatch が 先に 来ても 1 回 だけ／はじめて は hatchFirst ＋ 紙ふぶき 60', () => {
    const { fx } = make();
    fx.step([], eye);
    fx.onEvents(ev({ type: 'hatchStart', x: 3, y: 9, z: 4 }, { type: 'hatch', id: 1, breed: 'normal', gold: false, first: true }));
    for (let i = 0; i < 3; i++) fx.step([], eye);
    expect(fx.played).toEqual(['hatchFirst']);
    expect(fx.fx().confetti).toBe(60);
    expect(fx.particles.active(2)).toBe(60);
  });

  it('first が 省略 なら この 遊び の 中 の 1 わ目 が はじめて。2 わ目 は ふつう の 音 で 紙ふぶき なし', () => {
    const { fx } = make();
    fx.step([], eye);
    fx.onEvents(ev({ type: 'hatch', id: 1, breed: 'normal', gold: false }));
    expect(fx.played).toEqual(['hatchFirst']);
    fx.onEvents(ev({ type: 'hatch', id: 2, breed: 'normal', gold: false }));
    expect(fx.played).toEqual(['hatchFirst', 'hatch']);
    expect(fx.fx().confetti).toBe(60);
  });

  it('マッチョ: 2 わ目 以降 でも hatchMacho。はじめての マッチョ だけ 紙ふぶき', () => {
    const { fx } = make();
    fx.step([], eye);
    fx.onEvents(ev({ type: 'hatch', id: 1, breed: 'normal', gold: false, first: false }));
    fx.onEvents(ev({ type: 'hatch', id: 2, breed: 'macho', gold: false, first: false }));
    expect(fx.played).toEqual(['hatch', 'hatchMacho']);
    expect(fx.fx().confetti).toBe(60);
    fx.onEvents(ev({ type: 'hatch', id: 3, breed: 'macho', gold: false, first: false }));
    expect(fx.fx().confetti).toBe(60); // 2 わ目 の マッチョ は なし
  });

  it('動きの 強さ 0: 紙ふぶき・から の つぶ を 出さない（音 と 数は のこる）', () => {
    const { fx } = make(0);
    fx.step([], eye);
    fx.onEvents(ev({ type: 'hatchStart', x: 3, y: 9, z: 4 }, { type: 'hatch', id: 1, breed: 'normal', gold: false, first: true }));
    for (let i = 0; i < 25; i++) fx.step([], eye);
    expect(fx.particles.active()).toBe(0);
    expect(fx.fx().confetti).toBe(0);
    expect(fx.played).toContain('hatchFirst');
    expect(fx.fx().shell).toBe(6);
  });
});

describe('小屋・大人・金・あつめる', () => {
  it('home: 音 home ＋ ハート 3', () => {
    const { fx } = make();
    fx.step([view(1)], eye);
    fx.onEvents(ev({ type: 'home', id: 1, coop: 1 }));
    expect(fx.played).toEqual(['home']);
    expect(fx.fx().hearts).toBe(3);
    expect(fx.particles.active(1)).toBe(3);
  });

  it('grow: はじめて = growFirst ＋ 紙ふぶき／2 わ目 = grow ＋ キラッ 8', () => {
    const { fx } = make();
    fx.step([view(1), view(2)], eye);
    fx.onEvents(ev({ type: 'grow', id: 1, first: true, breed: 'normal' }));
    expect(fx.played).toEqual(['growFirst']);
    expect(fx.fx().confetti).toBe(60);
    expect(fx.fx().sparkle).toBe(0);
    fx.onEvents(ev({ type: 'grow', id: 2, first: false, breed: 'normal' }));
    expect(fx.played).toEqual(['growFirst', 'grow']);
    expect(fx.fx().sparkle).toBe(8);
    expect(fx.fx().confetti).toBe(60);
  });

  it('金 の たまご: 毎回 goldenEgg ＋ 紙ふぶき 60 ＋ キラッ 8（ふつう の たまご は egg ＋ キラッ 4）', () => {
    const { fx } = make();
    fx.step([], eye);
    fx.onEvents(ev({ type: 'egg', id: 1, x: 2, y: 9, z: 2, gold: true }));
    fx.onEvents(ev({ type: 'egg', id: 2, x: 2, y: 9, z: 2, gold: true }));
    expect(fx.played).toEqual(['goldenEgg', 'goldenEgg']);
    expect(fx.fx().confetti).toBe(120);
    expect(fx.fx().sparkle).toBe(16);
    fx.fxReset();
    fx.onEvents(ev({ type: 'egg', id: 3, x: 2, y: 9, z: 2 }));
    expect(fx.played[2]).toBe('egg');
    expect(fx.fx().sparkle).toBe(4);
    expect(fx.fx().confetti).toBe(0);
  });

  it('あつめる: 4 こ まで = collect、5 こ 以上 = collectMany、0 こ = なし', () => {
    const { fx } = make();
    fx.onEvents(ev({ type: 'coopCollect', egg: 2, gold: 1 }, { type: 'coopCollect', egg: 4, gold: 1 }, { type: 'coopCollect', egg: 0, gold: 0 }));
    expect(fx.played).toEqual(['collect', 'collectMany']);
  });

  it('play(): こたつ に 入れた・小屋 を 置いた は つなぎ込み が 呼ぶ', () => {
    const { fx } = make();
    fx.play('kitPut');
    fx.play('coopPlace');
    expect(fx.played).toEqual(['kitPut', 'coopPlace']);
  });
});

describe('毎ステップ の 声・音', () => {
  it('ひよこ の ぴよぴよ: 300〜600 ステップ に 1 回。大人 には 出ない／とおい と 出ない', () => {
    const { fx } = make();
    const chick = view(1, { stage: 'chick', friend: true });
    const adult = view(2, { stage: 'adult', friend: true });
    const far = view(3, { stage: 'chick', x: 40 });
    for (let i = 0; i < 700; i++) fx.step([chick, adult, far], eye);
    const peeps = fx.played.filter((n) => n === 'peep').length;
    expect(peeps).toBeGreaterThanOrEqual(1);
    expect(peeps).toBeLessThanOrEqual(3);
    expect(fx.played.filter((n) => n === 'cluck')).toHaveLength(0);
  });

  it('いびき: 近く 8 マス の ねて いる 子 だけ。90 ステップ に 1 回', () => {
    const { fx } = make();
    const near = view(1, { state: 'sleep' });
    const far = view(2, { state: 'sleep', x: 12 });
    for (let i = 0; i < 270; i++) fx.step([near, far], eye);
    expect(fx.played.filter((x) => x === 'sleep')).toHaveLength(3);
  });

  it('こたつ の ゆれ: 近くで ときどき = 600 ごと、よく ゆれる = 180 ごと。じっと・とおい は 鳴らない', () => {
    const { fx } = make();
    const kit = (wobble: 0 | 1 | 2, left: number, x = 1): KitInfo => ({ x, y: 9, z: 1, egg: 'egg', left, wobble });
    fx.step([], eye, [kit(0, 11), kit(1, 600 * 3 + 5), kit(2, 180 * 2 + 5, 30)]);
    expect(fx.played).toEqual([]);
    fx.step([], eye, [kit(1, 600 * 3 + 11)]);
    expect(fx.played).toEqual(['kitWobble']);
    fx.step([], eye, [kit(2, 180 * 5 + 11)]);
    expect(fx.played).toEqual(['kitWobble', 'kitWobble']);
    fx.step([], eye, [kit(2, 180 * 5 + 11, 30)]);
    expect(fx.played).toHaveLength(2);
  });

  it('金 の たまご が ある 小屋: ときどき キラッ（数には 入れない）', () => {
    const { fx } = make();
    const coop = (gold: number): CoopInfo => ({ id: 1, x: 2, y: 9, z: 2, dir: 0, gate: { x: 2, z: 4 }, kids: [], nest: { egg: 0, gold } });
    for (let i = 0; i < 100; i++) fx.step([], eye, [], [coop(0)]);
    expect(fx.particles.active(4)).toBe(0);
    for (let i = 0; i < 100; i++) fx.step([], eye, [], [coop(1)]);
    expect(fx.particles.active(4)).toBeGreaterThan(0);
    expect(fx.fx().sparkle).toBe(0);
  });
});

describe('頭の 上の しるし（いえ・Z）', () => {
  it('Z: ねて いる 子 1 わ 1 つ（zzz は 数）。起きれば 0', () => {
    const { fx } = make();
    fx.step([view(1, { state: 'sleep' }), view(2, { state: 'sleep', x: 3 }), view(3)], eye);
    expect(fx.fx().zzz).toBe(2);
    const w = out();
    const n = fx.write(w, 64, { x: 1, z: 0 });
    const zs = Array.from(w.tile.slice(0, n)).filter((t) => t === TILE.zzz).length;
    expect(zs).toBe(2);
    fx.step([view(1), view(2, { x: 3 }), view(3)], eye);
    expect(fx.fx().zzz).toBe(0);
  });

  it('いえ の しるし: homeFill の うまりで 4 まい から えらぶ。marks[].home に 入る。とおい と 出ない', () => {
    const { fx } = make();
    const tiles = (h: number, x = 0) => {
      fx.step([view(1, { friend: true, homeFill: h, x })], eye);
      const w = out();
      const n = fx.write(w, 64, { x: 1, z: 0 });
      return Array.from(w.tile.slice(0, n)).filter((t) => t >= TILE.houseEmpty);
    };
    expect(tiles(0.1)).toEqual([TILE.houseEmpty]);
    expect(fx.fx().marks[0].home).toBeCloseTo(0.1);
    expect(tiles(0.4)).toEqual([TILE.house1]);
    expect(tiles(0.7)).toEqual([TILE.house2]);
    expect(tiles(1)).toEqual([TILE.house3]);
    expect(tiles(0.5, 40)).toEqual([]);
    expect(fx.fx().marks).toEqual([]);
  });

  it('ひよこ の しるし は ひくい（大人 より 低い）・おなかいっぱい と いっしょ でも かさならない', () => {
    const { fx } = make();
    fx.step([view(1, { stage: 'chick', friend: true, homeFill: 0.5, fullLeft: 300 })], eye);
    const w = out();
    const n = fx.write(w, 64, { x: 1, z: 0 });
    expect(n).toBe(2);
    expect(w.pos[1]).toBeLessThan(9 + ANIMAL_FX.headHeartY);
    expect(w.pos[0]).not.toBeCloseTo(w.pos[3], 3);
  });
});
