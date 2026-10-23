import { describe, expect, it } from 'vitest';
import { CountryWatch } from './countryWatch';

/** #291 COUNTRY-1 AC11・AC12・AC13・AC19（docs/design/COUNTRY-1.md §4.1） */
const BLEND = 14;
interface Spot { kind: string; e: number; ground: number }
function make() {
  const spot: Spot = { kind: 'mori', e: 50, ground: 20 };
  const entered: string[] = [];
  const w = new CountryWatch({
    at: () => ({ kind: spot.kind, e: spot.e }),
    heightAt: () => spot.ground,
    blend: BLEND,
    onEnter: (k) => entered.push(k),
  });
  let tick = 0;
  const run = (n: number, y = spot.ground + 1) => {
    for (let i = 0; i < n; i++) w.step({ x: tick++ % 2, y, z: 0 }, 1); // 偽の at は 位置を 見ない。列を かえて 毎コマ 聞かせる
  };
  return { spot, entered, w, run };
}

describe('国に入った判定', () => {
  it('はじめは null。179 コマでは 入らず 180 コマで 入る（1 回だけ）', () => {
    const { w, entered, run } = make();
    expect(w.current()).toBeNull();
    run(179);
    expect(entered).toEqual([]);
    expect(w.current()).toBeNull();
    run(1);
    expect(entered).toEqual(['mori']);
    expect(w.current()).toBe('mori');
    run(500);
    expect(entered).toEqual(['mori']);
  });
  it('AC11: 境目（e < blend）に 1,000 コマ いても かわらない・数えなおし', () => {
    const { spot, w, entered, run } = make();
    spot.e = BLEND - 1;
    run(1000);
    expect(entered).toEqual([]);
    expect(w.current()).toBeNull();
    spot.e = 50;
    run(100);
    spot.e = BLEND - 1;
    run(1);
    spot.e = 50;
    run(179);
    expect(entered).toEqual([]);
    run(1);
    expect(entered).toEqual(['mori']);
  });
  it('AC12: 足の y が heightAt − 8 以下なら 数えない。heightAt − 7 なら 180 コマで 入る', () => {
    const a = make();
    a.run(1000, a.spot.ground - 8);
    expect(a.entered).toEqual([]);
    const b = make();
    b.run(180, b.spot.ground - 7);
    expect(b.entered).toEqual(['mori']);
  });
  it('AC13: 60 コマずつ 10 往復しても かわらない。180 コマで A、そのあと 180 コマで B', () => {
    const { spot, w, entered, run } = make();
    for (let i = 0; i < 10; i++) {
      spot.kind = 'mori';
      run(60);
      spot.kind = 'hana';
      run(60);
    }
    expect(w.current()).toBeNull();
    expect(entered).toEqual([]);
    spot.kind = 'mori';
    run(180);
    expect(w.current()).toBe('mori');
    spot.kind = 'hana';
    run(179);
    expect(w.current()).toBe('mori');
    run(1);
    expect(w.current()).toBe('hana');
    expect(entered).toEqual(['mori', 'hana']);
  });
  it('AC19: quiet(true) の間は 数えない。quiet(false) に もどすと 180 コマで 入る', () => {
    const { w, entered, run } = make();
    w.quiet(true);
    run(500);
    expect(entered).toEqual([]);
    expect(w.current()).toBeNull();
    w.quiet(false);
    run(179);
    expect(entered).toEqual([]);
    run(1);
    expect(entered).toEqual(['mori']);
  });
  it('止まっている間（steps 0）は 数えない。1/4 の速さの間は 1/4 ずつ', () => {
    const { w, entered, spot } = make();
    for (let i = 0; i < 1000; i++) w.step({ x: i % 2, y: spot.ground + 1, z: 0 }, 0);
    expect(entered).toEqual([]);
    for (let i = 0; i < 719; i++) w.step({ x: i % 2, y: spot.ground + 1, z: 0 }, 0.25);
    expect(entered).toEqual([]);
    w.step({ x: 1, y: spot.ground + 1, z: 0 }, 0.25);
    expect(entered).toEqual(['mori']);
  });
  it('同じ列にいる間は at・heightAt を 呼びなおさない（地下の比べは 毎コマ）', () => {
    let at = 0;
    let hh = 0;
    const entered: string[] = [];
    const w = new CountryWatch({ at: () => (at++, { kind: 'mori', e: 50 }), heightAt: () => (hh++, 20), blend: BLEND, onEnter: (k) => entered.push(k) });
    for (let i = 0; i < 100; i++) w.step({ x: 5.2, y: 21, z: 5.7 }, 1);
    expect([at, hh]).toEqual([1, 1]);
    w.step({ x: 6.2, y: 21, z: 5.7 }, 1);
    expect([at, hh]).toEqual([2, 2]);
    for (let i = 0; i < 300; i++) w.step({ x: 6.2, y: 12, z: 5.7 }, 1); // 同じ列でも 地下なら 数えない
    expect(entered).toEqual([]);
  });
});
