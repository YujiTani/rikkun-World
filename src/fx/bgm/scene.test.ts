import { describe, expect, it } from 'vitest';
import type { DayPhase, YokaiState } from '../../contracts';
import { createAudioSettings } from '../audioConfig';
import { BgmSceneTracker, screenLevel, type BgmSceneInput } from './scene';

const P = { x: 0, y: 0, z: 0 };
const yokai = (state: YokaiState, dist: number) => ({ state, position: { x: dist, y: 0, z: 0 } });

function mk() {
  const s = createAudioSettings();
  const tr = new BgmSceneTracker(s);
  const base = (tick: number, phase: DayPhase, ys: BgmSceneInput['yokai'] = [], dead = false): BgmSceneInput => ({ tick, phase, player: P, yokai: ys, dead });
  return { s, tr, base };
}

describe('B3 場面（時間帯）', () => {
  it('day・dawn → day、dusk・night → night', () => {
    const { tr, base } = mk();
    expect(tr.update(base(0, 'day'))).toBe('day');
    expect(tr.update(base(1, 'dawn'))).toBe('day');
    expect(tr.update(base(2, 'dusk'))).toBe('night');
    expect(tr.update(base(3, 'night'))).toBe('night');
    expect(tr.scene()).toBe('night');
  });
});

describe('B3 場面（たたかい）', () => {
  it('chase が 16 以内に 29 ステップ → まだ、30 ステップ → battle', () => {
    const { tr, base } = mk();
    for (let t = 0; t < 30; t++) expect(tr.update(base(t, 'day', [yokai('chase', 10)]))).toBe('day');
    expect(tr.update(base(30, 'day', [yokai('chase', 10)]))).toBe('battle');
  });
  it('attack も数える。ちょうど 16 は数える', () => {
    const { tr, base } = mk();
    for (let t = 0; t <= 30; t++) tr.update(base(t, 'night', [yokai('attack', 16)]));
    expect(tr.scene()).toBe('battle');
  });
  it('10 ステップごとに見る（疎な呼び出し）でも tick の差で数える', () => {
    const { tr, base } = mk();
    expect(tr.update(base(100, 'day', [yokai('chase', 5)]))).toBe('day');
    expect(tr.update(base(110, 'day', [yokai('chase', 5)]))).toBe('day');
    expect(tr.update(base(120, 'day', [yokai('chase', 5)]))).toBe('day');
    expect(tr.update(base(130, 'day', [yokai('chase', 5)]))).toBe('battle');
  });
  it('途中でいなくなったら数えなおし', () => {
    const { tr, base } = mk();
    for (let t = 0; t < 20; t++) tr.update(base(t, 'day', [yokai('chase', 5)]));
    tr.update(base(20, 'day', []));
    for (let t = 21; t < 50; t++) expect(tr.update(base(t, 'day', [yokai('chase', 5)]))).toBe('day');
    expect(tr.update(base(51, 'day', [yokai('chase', 5)]))).toBe('battle');
  });
  it('いなくなって 239 → battle のまま、240 → もどる', () => {
    const { tr, base } = mk();
    for (let t = 0; t <= 30; t++) tr.update(base(t, 'night', [yokai('chase', 5)]));
    expect(tr.scene()).toBe('battle');
    // 31 でいなくなった
    for (let t = 31; t < 31 + 240; t++) expect(tr.update(base(t, 'night', []))).toBe('battle');
    expect(tr.update(base(31 + 240, 'night', []))).toBe('night');
  });
  it('もどる途中でまた近づいたら、4 秒数えなおし', () => {
    const { tr, base } = mk();
    for (let t = 0; t <= 30; t++) tr.update(base(t, 'day', [yokai('chase', 5)]));
    for (let t = 31; t < 200; t++) tr.update(base(t, 'day', []));
    tr.update(base(200, 'day', [yokai('chase', 5)]));
    for (let t = 201; t < 201 + 240; t++) expect(tr.update(base(t, 'day', []))).toBe('battle');
    expect(tr.update(base(201 + 240, 'day', []))).toBe('day');
  });
  it('17 ブロック先・wander・idle などは数えない', () => {
    const { tr, base } = mk();
    for (let t = 0; t < 200; t++) {
      expect(tr.update(base(t, 'day', [yokai('chase', 17), yokai('wander', 3), yokai('idle', 3), yokai('retreat', 3), yokai('search', 3)]))).toBe('day');
    }
  });
  it('やられているあいだは変えない（battle のまま・day のまま）', () => {
    const { tr, base } = mk();
    for (let t = 0; t <= 30; t++) tr.update(base(t, 'day', [yokai('chase', 5)]));
    for (let t = 31; t < 1000; t++) expect(tr.update(base(t, 'dusk', [], true))).toBe('battle');
    const b = mk();
    expect(b.tr.update(b.base(0, 'day'))).toBe('day');
    for (let t = 1; t < 400; t++) expect(b.tr.update(b.base(t, 'night', [yokai('chase', 5)], true))).toBe('day');
  });
  it('設定を変えると効く（battleRange・battleEnterTicks）', () => {
    const { s, tr, base } = mk();
    s.battleEnterTicks = 10;
    s.battleRange = 4;
    for (let t = 0; t < 40; t++) tr.update(base(t, 'day', [yokai('chase', 5)]));
    expect(tr.scene()).toBe('day');
    for (let t = 40; t <= 50; t++) tr.update(base(t, 'day', [yokai('chase', 3)]));
    expect(tr.scene()).toBe('battle');
  });
});

describe('B6 screenLevel', () => {
  it('play 1・inventory 0.7・guide 0.4・celebrate 1（duck は別）', () => {
    expect(screenLevel('play', false)).toBe(1);
    expect(screenLevel('inventory', false)).toBe(0.7);
    expect(screenLevel('guide', false)).toBe(0.4);
    expect(screenLevel('celebrate', false)).toBe(1);
  });
  it('やられた画面は 1（どの画面でも）', () => {
    expect(screenLevel('play', true)).toBe(1);
    expect(screenLevel('guide', true)).toBe(1);
    expect(screenLevel('inventory', true)).toBe(1);
  });
});
