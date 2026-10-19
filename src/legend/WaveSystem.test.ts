import { describe, expect, it } from 'vitest';
import { createW2Settings, type ItemId, type YokaiInfo } from '../contracts';
import { createWaveSystem, type WaveEvent, type WaveStepCtx } from './WaveSystem';

const ITEM = 'fujin_ken' as ItemId;
const ctx = (over: Partial<WaveStepCtx> = {}): WaveStepCtx => ({ item: ITEM, tech: 'thrust', phase: 'active', frame: 5, startup: 4, dirDeg: 0, body: { x: 0.5, y: 1.4, z: 0.5 }, ...over });
const idle = ctx({ phase: 'idle', tech: null, frame: 0 });

function rig(solid: (x: number, y: number, z: number) => boolean = () => false, yokai: Partial<YokaiInfo>[] = []) {
  const events: WaveEvent[] = [];
  const dmg: number[] = [];
  const sounds: number[] = [];
  const list = yokai.map((y, i) => ({ id: i + 1, kind: 'karakasa', scale: 1, state: 'idle', position: { x: 0.5, y: 0, z: -3 }, ...y })) as unknown as YokaiInfo[];
  const w = createWaveSystem({
    world: { isSolid: solid },
    yokai: () => ({ list: () => list, damage: (_id: number, a: number) => void dmg.push(a) }) as never,
    settings: createW2Settings(),
    tick: () => 0,
    emit: (e) => events.push(e),
    sound: (v) => sounds.push(v),
    seed: 3,
  });
  return { w, events, dmg, sounds };
}

describe('WEAPON-7 PR2 真空波', () => {
  it('当たりの はじめの F に 1 つ・北へ 1 ステップ 0.25・20 ステップで range', () => {
    const r = rig();
    r.w.step(ctx());
    expect(r.events.map((e) => e.type)).toEqual(['waveStart']);
    expect(r.w.list()).toHaveLength(1);
    expect(r.w.list()[0]!.dir.z).toBeCloseTo(-1, 10);
    for (let i = 1; i <= 20; i++) r.w.step(idle);
    expect(r.w.list()).toHaveLength(0);
    expect(r.events.at(-1)).toMatchObject({ type: 'waveEnd', reason: 'range' });
  });
  it('ほかの F・パリィ・風神剣でない 物では 出ない', () => {
    const r = rig();
    r.w.step(ctx({ frame: 4 }));
    r.w.step(ctx({ item: 'katana' as ItemId }));
    r.w.step(ctx({ phase: 'startup' }));
    expect(r.events).toEqual([]);
  });
  it('妖怪には 1 回だけ P×0.3 = 1.8（つらぬく）', () => {
    const r = rig(() => false, [{ position: { x: 0.5, y: 0, z: -1.5 } }, { position: { x: 0.5, y: 0, z: -4 } }]);
    r.w.step(ctx());
    for (let i = 0; i < 20; i++) r.w.step(idle);
    expect(r.dmg).toEqual([1.8, 1.8]);
    expect(r.events.filter((e) => e.type === 'waveHit')).toHaveLength(2);
  });
  it('固い ブロックに ふれたら 消える（前 1.5）。うしろの 妖怪には 当たらない', () => {
    const r = rig((_x, _y, z) => z === -1, [{ position: { x: 0.5, y: 0, z: -4 } }]);
    r.w.step(ctx());
    let maxT = 0;
    for (let i = 0; i < 20; i++) {
      r.w.step(idle);
      for (const w of r.w.list()) maxT = Math.max(maxT, w.traveled);
    }
    expect(r.events.filter((e) => e.type === 'waveEnd')).toEqual([expect.objectContaining({ reason: 'block' })]);
    expect(r.dmg).toEqual([]);
    expect(maxT).toBeLessThanOrEqual(1.5);
  });
  it('出た 直後に かべ → その ステップで 消える', () => {
    const r = rig(() => true);
    r.w.step(ctx());
    expect(r.events.map((e) => e.type)).toEqual(['waveStart', 'waveEnd']);
    expect(r.w.list()).toHaveLength(0);
  });
  it('音の 高さは 3 つの 中から 前と ちがう 物', () => {
    const r = rig();
    for (let i = 0; i < 30; i++) {
      r.w.step(ctx());
      r.w.step(idle);
    }
    for (let i = 1; i < r.sounds.length; i++) expect(r.sounds[i]).not.toBe(r.sounds[i - 1]);
    expect(new Set(r.sounds).size).toBe(3);
  });
});
