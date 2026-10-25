import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { BigHit, type BoxLike } from './gashaBigHit';

const core = (): BoxLike => ({ name: 'core', c: [0, 5, 0], ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [1, 1, 1] });
const hand = (): BoxLike => ({ name: 'handL', c: [8, 5, 0], ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [1, 1, 1] });

describe('とどめの あとの 当たり（体力 0 のあと: コアだけ 数える）', () => {
  it('finish が off の 間は ふつうに ダメージ。lock では どの 部位も ダメージ 0（体力は 0 の まま）', () => {
    const bh = new BigHit({ scene: new Scene(), angry: () => undefined });
    bh.bind([core(), hand()], null);
    expect(bh.damage('hand', 10)).toBeGreaterThan(0);
    bh.setFinish('lock');
    const hp = bh.hp;
    expect(bh.damage('hand', 1000)).toBe(0);
    expect(bh.damage('core', 1000)).toBe(0);
    expect(bh.damage('girl', 1000)).toBe(0);
    expect(bh.hp).toBe(hp);
  });

  it('core モード: コアだけ onCoreHit に 知らせる（受け入れられたら 1 を 返す）。怒らせず・ふり落としも しない。ほかの 部位は 0', () => {
    let angry = 0, thrown = 0, hits = 0, accept = true;
    const bh = new BigHit({
      scene: new Scene(), angry: () => { angry++; }, onCore: () => { thrown++; },
      onCoreHit: () => { hits++; return accept; },
    });
    bh.bind([core(), hand()], null);
    bh.setFinish('core');
    expect(bh.damage('hand', 1000)).toBe(0);
    expect(hits).toBe(0);
    expect(bh.damage('core', 5)).toBe(1);
    expect(hits).toBe(1);
    accept = false;
    expect(bh.damage('core', 5)).toBe(0); // 間かくが あいて いない など
    expect(angry + thrown).toBe(0);
    expect(bh.hp).toBe(bh.maxHp);
  });

  it('reset() で ふつうの モードに もどる。setCoreReach で コアだけ 当たりが 太る', () => {
    const bh = new BigHit({ scene: new Scene(), angry: () => undefined });
    bh.bind([core()], null);
    bh.setFinish('lock');
    bh.reset();
    expect(bh.damage('core', 5)).toBeGreaterThan(0);
  });

  it('刀の 当たりが コアの すぐ そばを とおる とき、coreReach の ぶんだけ とどく', () => {
    const blade = { shape: { kind: 'capsule', from: { x: 3.2, y: 5, z: 0 }, to: { x: 3.2, y: 6, z: 0 }, radius: 0.1 }, damage: 10, swing: 'a', frame: 3 };
    const mk = () => {
      const got: number[] = [];
      const bh = new BigHit({ scene: new Scene(), angry: () => undefined, onCoreHit: () => { got.push(1); return true; }, sources: { blade: () => blade as never } });
      bh.bind([core()], null);
      bh.setFinish('core');
      return { bh, got };
    };
    const a = mk(); a.bh.step(1 / 60);
    expect(a.got.length).toBe(0); // コアの はしから 2.2 ブロック はなれて いて とどかない
    const b = mk(); b.bh.setCoreReach(2.5); b.bh.step(1 / 60);
    expect(b.got.length).toBe(1);
  });
});
