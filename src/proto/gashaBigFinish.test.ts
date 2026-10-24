import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FinishSeq, fallEase } from './gashaBigFinish';
import { TUNE as T } from './gashaBigTuning';

const run = (f: FinishSeq, sec: number, dt = 1 / 60): string[] => {
  const out: string[] = [];
  for (let i = 0; i < Math.round(sec / dt); i++) for (const e of f.update(dt)) out.push(e.kind);
  return out;
};

describe('とどめの 流れ（一撃 → 倒れる → 赤い コア → たたく → くずれる → 消える）', () => {
  const saved = JSON.stringify(T.finish);
  beforeEach(() => { Object.assign(T.finish.core, { hits: 3, hitGapSec: 0.3 }); });
  afterEach(() => { const o = JSON.parse(saved) as typeof T.finish; Object.assign(T.finish.core, o.core); });

  it('順番どおり: blow → fall → lie → (コア 3 回) → crumble → gone。時間は 調整表どおり', () => {
    const f = new FinishSeq();
    expect(f.phase).toBe('off');
    expect(f.begin().map((e) => e.kind)).toEqual(['blow']);
    expect(f.phase).toBe('blow');
    const ev = run(f, T.finish.fall.delaySec + T.finish.fall.sec + 0.2);
    expect(ev).toEqual(['fall', 'lie']);
    expect(f.phase).toBe('lie');
    const hits: string[] = [];
    for (let k = 0; k < 3; k++) {
      const r = f.hitCore();
      expect(r.accepted).toBe(true);
      expect(r.left).toBe(2 - k);
      hits.push(...r.events.map((e) => e.kind));
      run(f, 0.4);
    }
    expect(hits).toEqual(['coreHit', 'coreHit', 'coreHit', 'crumble']);
    expect(f.phase).toBe('crumble');
    const end = run(f, T.finish.crumble.sec + 0.2);
    expect(end).toEqual(['gone']);
    expect(f.phase).toBe('gone');
  });

  it('倒れて いる 間と くずれ はじめて からは コアを たたいても 数えない。1 振りで 2 回は 数えない(hitGapSec)', () => {
    const f = new FinishSeq();
    f.begin();
    expect(f.hitCore().accepted).toBe(false); // blow
    run(f, T.finish.fall.delaySec + 1);
    expect(f.phase).toBe('fall');
    expect(f.hitCore().accepted).toBe(false);
    run(f, T.finish.fall.sec);
    expect(f.phase).toBe('lie');
    expect(f.hitCore().accepted).toBe(true);
    expect(f.hitCore().accepted).toBe(false); // すぐ もう 1 回 → 数えない
    run(f, T.finish.core.hitGapSec + 0.05);
    expect(f.hitCore().accepted).toBe(true);
    expect(f.coreHp).toBe(1);
  });

  it('進み具合: fallK は 0 → 1（はじめは ゆっくり）、crumbleK は 0 → 1。赤さ(redK)は 倒れおわって から 上がる', () => {
    const f = new FinishSeq();
    f.begin();
    expect(f.fallK).toBe(0);
    run(f, T.finish.fall.delaySec + T.finish.fall.sec * 0.5);
    expect(f.fallK).toBeGreaterThan(0);
    expect(f.fallK).toBeLessThan(0.5); // ease > 1 なので まだ はんぶん 以下
    expect(f.redK).toBe(0);
    run(f, T.finish.fall.sec * 0.5 + 0.1);
    expect(f.fallK).toBe(1);
    run(f, T.finish.core.redSec * 0.5);
    expect(f.redK).toBeGreaterThan(0.3);
    expect(f.redK).toBeLessThan(0.7);
    run(f, T.finish.core.redSec);
    expect(f.redK).toBe(1);
  });

  it('fallEase: 0 → 0、1 → 1、ease が 大きい ほど 前半が ゆっくり', () => {
    expect(fallEase(0, 2.2)).toBe(0);
    expect(fallEase(1, 2.2)).toBe(1);
    expect(fallEase(0.5, 2.2)).toBeLessThan(fallEase(0.5, 1.2));
    expect(fallEase(0.5, 1)).toBeCloseTo(0.5, 6);
  });

  it('cancel() / begin() 2 回目は 何も しない', () => {
    const f = new FinishSeq();
    f.begin();
    expect(f.begin()).toEqual([]);
    f.cancel();
    expect(f.phase).toBe('off');
    expect(run(f, 5)).toEqual([]);
  });

  it('大きな dt でも 取りこぼさず 順番に 出る', () => {
    const f = new FinishSeq();
    f.begin();
    expect(f.update(100).map((e) => e.kind)).toEqual(['fall', 'lie']);
  });
});
