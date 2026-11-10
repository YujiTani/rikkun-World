import { describe, expect, it } from 'vitest';
import { setupDuo } from './duoKit';

/**
 * むし を あげて たまごを うむ 動きの 最中（60 ステップ）に もう 1 回 あげても「おなかいっぱい」の 合図が 出る
 * （UI 検査 'duo-animal-hud' で 見つかった。なかまは 1 回目で たまごを うむ ことが あり、そのとき 40 ステップ 後でも 動きの 最中）。
 */
describe('動きの 最中の 2 回目の むし', () => {
  const setup = () => {
    const s = setupDuo({ seed: 1 });
    s.settings.animalEggChance = 1; // 1 回目で かならず たまごを うむ（動きの 最中が 長い）
    const id = s.m.spawn(22.5, 9, 20.5, { friend: true, follow: s.settings.animalFollowTicks, natsuki: 30, stage: 'adult' })!;
    s.step(35);
    s.m.events();
    return { s, id };
  };

  it('1P: 40 ステップ後（まだ たまごを うむ 動きの 最中）の 2 回目は full。むし は へらない（consume は ate だけ）・動きは そのまま', () => {
    const { s, id } = setup();
    expect(s.m.feed(id, 'mushi', 1)).toBe('ate');
    s.step(40);
    expect(s.m.preview(id, { item: 'mushi', count: 5 })).toBe('animalFull');
    const before = s.m.list().find((a) => a.id === id)!.state;
    expect(s.m.feed(id, 'mushi', 1)).toBe('full');
    expect(s.m.list().find((a) => a.id === id)!.state).toBe(before);
  });

  it('2P も 同じ（by: 2 で 合図が 出る ように 口は who 2）', () => {
    const { s, id } = setup();
    expect(s.m.feed(id, 'mushi', 2)).toBe('ate');
    s.step(40);
    s.m.events();
    expect(s.m.feed(id, 'mushi', 2)).toBe('full');
    s.m.emitHint('fullHint', 2);
    expect(s.m.events().filter((e) => e.type === 'hint')).toEqual([{ type: 'hint', hint: 'fullHint', by: 2 }]);
  });

  it('むし 以外は 今までどおり null。たまごを うまない ときの ついばむ 最中も null', () => {
    const { s, id } = setup();
    expect(s.m.feed(id, 'mushi', 1)).toBe('ate');
    expect(s.m.feed(id, 'egg', 1)).toBeNull();
    const t = setupDuo({ seed: 1 });
    t.settings.animalEggChance = 0;
    const b = t.m.spawn(22.5, 9, 20.5, { friend: true, follow: t.settings.animalFollowTicks, natsuki: 30, stage: 'adult' })!;
    t.step(35);
    expect(t.m.feed(b, 'mushi', 1)).toBe('ate');
    expect(t.m.feed(b, 'mushi', 1)).toBeNull();
  });
});
