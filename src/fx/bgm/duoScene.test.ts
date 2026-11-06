import { describe, expect, it } from 'vitest';
import type { DayPhase, YokaiState } from '../../contracts';
import { createAudioSettings } from '../audioConfig';
import { BgmSceneTracker, type BgmSceneInput } from './scene';

/**
 * COOP-1 作業 3c（#417）の 見張り（AC68）。BGM の 場面は 1P で 決める（仕様 §3.4・§9.7）。
 * **今の 実装で 緑**: 場面の 判定（BgmSceneTracker）は 最初から 1P の 位置だけを 受けとる 作りなので、2 人用に して 赤に なる 所は ない。
 * これは「2P の 位置を 渡すように 変えて しまわない」ための 見張り。配線（src/game/wire/player.ts の audioStep）が `player` に
 * 1P の `controller.state.position`、`dead` に 1P の `combat.dead()` を 渡し続ける 約束（2P の 位置・2P の 倒れ を 混ぜない）。
 * やかたの ふんいき・挑戦の 曲は MINE-1F §3.4 の まま（だれか 1 人）。MINE-1F の テストで 見る。
 * 数（battleRange・battleEnterTicks・battleExitTicks）は createAudioSettings() から 読む。
 */

const S = createAudioSettings();
const R = S.battleRange;
const ENTER = S.battleEnterTicks;
const EXIT = S.battleExitTicks;
const P1 = { x: 0, y: 0, z: 0 };
/** 2P は 1P から 十分 遠い（妖怪が 2P を 追っていても 1P からは battleRange より 遠い） */
const P2 = { x: R * 3, y: 0, z: 0 };
const yokai = (state: YokaiState, near: { x: number; y: number; z: number }, d: number) => ({ state, position: { x: near.x + d, y: near.y, z: near.z } });

function mk() {
  const tr = new BgmSceneTracker(createAudioSettings());
  const input = (tick: number, ys: BgmSceneInput['yokai'], dead = false, phase: DayPhase = 'day'): BgmSceneInput => ({ tick, phase, player: P1, yokai: ys, dead });
  return { tr, input };
}

describe('AC68: BGM の 場面は 1P で 決める', () => {
  it('2P だけが 追われている（妖怪は 1P から battleRange より 遠い）あいだは battle に ならない', () => {
    for (const state of ['chase', 'attack'] as const) {
      const { tr, input } = mk();
      const y = yokai(state, P2, 3); // 2P の すぐ そば
      expect(Math.hypot(y.position.x - P1.x, y.position.y - P1.y, y.position.z - P1.z)).toBeGreaterThan(R);
      for (let t = 0; t < ENTER * 4; t++) expect(tr.update(input(t, [y])), `${state} ${t}`).toBe('day');
    }
  });

  it('1P が 追われると 今の 判定の ステップ数で battle（ENTER - 1 では まだ、ENTER で battle）', () => {
    const { tr, input } = mk();
    const y = yokai('chase', P1, R - 1);
    for (let t = 0; t < ENTER; t++) expect(tr.update(input(t, [y]))).toBe('day');
    expect(tr.update(input(ENTER, [y]))).toBe('battle');
  });

  it('2P を 追う 妖怪が いても、1P を 追う 妖怪が いれば 同じ ステップ数で battle', () => {
    const { tr, input } = mk();
    const ys = [yokai('chase', P2, 3), yokai('chase', P1, R - 1)];
    for (let t = 0; t < ENTER; t++) expect(tr.update(input(t, ys))).toBe('day');
    expect(tr.update(input(ENTER, ys))).toBe('battle');
  });

  it('1P の 戦いが おわったら、2P が まだ 追われていても EXIT で もどる（2P の 戦いで battle を のばさない）', () => {
    const { tr, input } = mk();
    const near1 = yokai('chase', P1, R - 1);
    const near2 = yokai('chase', P2, 3);
    for (let t = 0; t <= ENTER; t++) tr.update(input(t, [near1, near2]));
    expect(tr.scene()).toBe('battle');
    const t0 = ENTER + 1; // ここで 1P の 妖怪が いなくなる
    for (let t = t0; t < t0 + EXIT; t++) expect(tr.update(input(t, [near2]))).toBe('battle');
    expect(tr.update(input(t0 + EXIT, [near2]))).toBe('day');
  });

  it('やられている かの 判定は 1P（dead = 1P の combat.dead()）。dead の あいだは 数えない', () => {
    const { tr, input } = mk();
    const y = yokai('chase', P1, R - 1);
    for (let t = 0; t < ENTER * 3; t++) expect(tr.update(input(t, [y], true))).toBe('day');
  });
});
