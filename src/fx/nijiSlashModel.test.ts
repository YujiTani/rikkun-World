import { describe, expect, it } from 'vitest';
import {
  SLASH3,
  centroidOf,
  createHit,
  flashFrameAt,
  frameAt,
  frameSteps,
  hitAlive,
  makeRng,
  rollVariation,
  rowOf,
  spawnDelayOf,
  stepHit,
  streakCell,
  swingScreenAngleDeg,
  uvOf,
} from './nijiSlashModel';
import { slashSwingSign } from '../legend/slashView';

/** WEAPON-9 虹の 斬撃 v3（art/WEAPON-9/slash-niji/wiring.md）の 配線の きまり */
describe('コマ表', () => {
  it('3 つの わざの コマの ステップ数と 合計', () => {
    expect(SLASH3.techs.thrust.steps).toEqual([2, 2, 2, 2, 2, 2]);
    expect(SLASH3.techs.kiriage.steps).toEqual([2, 3, 3, 3, 2, 2]);
    expect(SLASH3.techs.kesa.steps).toEqual([2, 6, 3, 3, 3, 2]);
    expect(SLASH3.techs.kesa.total).toBe(19);
  });
  it('決めの コマ(keyFrame 1)の 長さ = 当たる 区間（つき 2・きりあげ 3・けさ 6）', () => {
    for (const [t, n] of [['thrust', 2], ['kiriage', 3], ['kesa', 6]] as const) {
      expect(SLASH3.techs[t].steps[1]).toBe(n);
      expect(SLASH3.techs[t].activeSteps).toBe(n);
    }
  });
  it('frameAt: コマごとに 切りかえ・おわったら -1', () => {
    const s = frameSteps('kiriage');
    expect(s).toEqual([2, 3, 3, 3, 2, 2]);
    const got = Array.from({ length: 16 }, (_, a) => frameAt(s, a));
    expect(got).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, -1]);
  });
  it('行: よこ・ねかせ × つき・きりあげ・けさ = 0〜5', () => {
    expect([rowOf('thrust', 'side'), rowOf('thrust', 'flat'), rowOf('kiriage', 'side'), rowOf('kiriage', 'flat'), rowOf('kesa', 'side'), rowOf('kesa', 'flat')]).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('uv: 6 コマ × 6 行。flipY の ぶん 行を 上下 さかさ。左右 反転は x の 向きを 逆に', () => {
    expect(uvOf(2, 4, false)).toEqual({ repeatX: 1 / 6, offsetX: 2 / 6, offsetY: 1 - 5 / 6 });
    const m = uvOf(2, 4, true);
    expect(m.repeatX).toBeCloseTo(-1 / 6, 9);
    expect(m.offsetX).toBeCloseTo(3 / 6, 9);
  });
});

describe('spawnDelay（techStart から 待つ）', () => {
  it('1 段目 = firstStage・2・3 段目 = comboStage', () => {
    expect(spawnDelayOf('thrust', 1)).toBe(2);
    expect(spawnDelayOf('thrust', 2)).toBe(2);
    expect(spawnDelayOf('kiriage', 1)).toBe(17);
    expect(spawnDelayOf('kiriage', 2)).toBe(10);
    expect(spawnDelayOf('kiriage', 3)).toBe(10);
    expect(spawnDelayOf('kesa', 1)).toBe(26);
    expect(spawnDelayOf('kesa', 3)).toBe(18);
  });
  it('出て 2 ステップ（出る コマ）の つぎが 決め = 当たりの 1 ステップ目', () => {
    // 当たりは techStart の 出だし(4/19/28)の あと。delay + 出る コマ 2 = 出だし
    expect(spawnDelayOf('thrust', 1) + SLASH3.techs.thrust.steps[0]!).toBe(4);
    expect(spawnDelayOf('kiriage', 1) + SLASH3.techs.kiriage.steps[0]!).toBe(19);
    expect(spawnDelayOf('kesa', 1) + SLASH3.techs.kesa.steps[0]!).toBe(28);
    expect(spawnDelayOf('kiriage', 2) + 2).toBe(12);
    expect(spawnDelayOf('kesa', 2) + 2).toBe(20);
  });
});

describe('左右 反転', () => {
  it('centroid の x を 64 − x に（まん中の 32 を 軸）', () => {
    const [x, y] = centroidOf('kesa', 'side', 5, false);
    const [mx, my] = centroidOf('kesa', 'side', 5, true);
    const lastX = SLASH3.techs.kesa.centroid.side[5]![0]!;
    expect(x).toBeCloseTo(lastX, 5);
    expect(mx).toBeCloseTo(64 - lastX, 5);
    expect(my).toBe(y);
  });
  it('slashSwingSign: カメラから 見て 右へ 振る = 1・左へ = −1', () => {
    // カメラは 南(+z)から 北を 見る → 右は +x。わざの 向き 90°(東) = 右
    expect(slashSwingSign(90, { x: 0, z: -3 })).toBe(1);
    expect(slashSwingSign(270, { x: 0, z: -3 })).toBe(-1);
    // カメラが 東から 西を 見る(cam→slash = -x) → 右は -z（北）。北向き 0° は 右
    expect(slashSwingSign(0, { x: -3, z: 0 })).toBe(1);
    expect(slashSwingSign(180, { x: -3, z: 0 })).toBe(-1);
  });
  it('振る 向き（画面）: つき 右・きりあげ 右上・けさ 右下。反転で 左右 だけ ぎゃく', () => {
    const t = swingScreenAngleDeg('thrust', false);
    const k = swingScreenAngleDeg('kiriage', false);
    const s = swingScreenAngleDeg('kesa', false);
    expect(Math.abs(t)).toBeLessThan(5);
    expect(k).toBeGreaterThan(20);
    expect(k).toBeLessThan(60);
    expect(s).toBeLessThan(-10);
    expect(swingScreenAngleDeg('kiriage', true)).toBeCloseTo(180 - k, 6);
  });
});

describe('ばらつき（シード付き）', () => {
  it('同じ シードなら 同じ 並び・ちがう シードなら ちがう', () => {
    const a = Array.from({ length: 6 }, ((r) => () => rollVariation(r))(makeRng(7)));
    const b = Array.from({ length: 6 }, ((r) => () => rollVariation(r))(makeRng(7)));
    const c = Array.from({ length: 6 }, ((r) => () => rollVariation(r))(makeRng(8)));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('角度 ±5°・大きさ ±5%・消える コマ 2〜4 の どれか 1 つに ±1', () => {
    const r = makeRng(1);
    for (let i = 0; i < 200; i++) {
      const v = rollVariation(r);
      expect(Math.abs(v.angleDeg)).toBeLessThanOrEqual(5);
      expect(Math.abs(v.scale - 1)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect([2, 3, 4]).toContain(v.lifeFrame);
      expect([-1, 1]).toContain(v.lifeDelta);
    }
  });
  it('frameSteps: 指定の コマだけ ±1（1 より 小さく しない）', () => {
    expect(frameSteps('kiriage', 3, 1)).toEqual([2, 3, 3, 4, 2, 2]);
    expect(frameSteps('thrust', 2, -1)).toEqual([2, 2, 1, 2, 2, 2]);
    expect(frameSteps('thrust', 2)).toEqual([2, 2, 2, 2, 2, 2]);
  });
});

describe('当たりの 火花', () => {
  it('数 6〜8（うしろへ 2）・うごきを へらす と うしろ 2 を 出さない', () => {
    const r = makeRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const h = createHit(r, 'kesa', false, false);
      expect(h.sparks.length).toBeGreaterThanOrEqual(6);
      expect(h.sparks.length).toBeLessThanOrEqual(8);
      expect(h.sparks.filter((s) => s.back)).toHaveLength(2);
      seen.add(h.sparks.length);
      const q = createHit(r, 'kesa', false, true);
      expect(q.sparks.some((s) => s.back)).toBe(false);
      expect(q.sparks.length).toBeGreaterThanOrEqual(4);
      expect(q.sparks.length).toBeLessThanOrEqual(6);
    }
    expect([...seen].sort()).toEqual([6, 7, 8]);
  });
  it('同じ シードなら 同じ 火花', () => {
    const a = createHit(makeRng(9), 'thrust', false, false);
    const b = createHit(makeRng(9), 'thrust', false, false);
    expect(a).toEqual(b);
  });
  it('はじめ 速く・毎ステップ 0.86 倍・寿命 14±3 のあと きえる・半分から 短い すじ', () => {
    const h = createHit(makeRng(5), 'thrust', false, false);
    const s0 = h.sparks[0]!;
    const v0 = Math.hypot(s0.vx, s0.vy);
    expect(v0 * 60).toBeGreaterThanOrEqual(9 * 0.8 * 0.6 - 1e-6);
    expect(v0 * 60).toBeLessThanOrEqual(9 * 1.2 + 1e-6);
    const x0 = s0.x;
    stepHit(h);
    expect(Math.hypot(s0.vx, s0.vy)).toBeCloseTo(v0 * 0.86, 9);
    expect(s0.x).not.toBe(x0);
    for (const s of h.sparks) {
      expect(s.life).toBeGreaterThanOrEqual(11);
      expect(s.life).toBeLessThanOrEqual(17);
    }
    expect(h.sparks[0]!.short).toBe(false);
    for (let i = 0; i < 18; i++) stepHit(h);
    expect(hitAlive(h)).toBe(false);
  });
  it('すじの 升は 速さの 向きに 近い 45°（ちょうど 右 = 0・上 = 2・左 = 4・下 = 6）', () => {
    expect(streakCell(0)).toBe(0);
    expect(streakCell(44)).toBe(1);
    expect(streakCell(90)).toBe(2);
    expect(streakCell(180)).toBe(4);
    expect(streakCell(-90)).toBe(6);
    expect(streakCell(-20)).toBe(0);
    expect(streakCell(359)).toBe(0);
  });
  it('まん中の 光: 2・2・3 ステップの 3 コマ・うごきを へらす と 1 コマ目 だけ', () => {
    const f = Array.from({ length: 8 }, (_, a) => flashFrameAt(a, false));
    expect(f).toEqual([0, 0, 1, 1, 2, 2, 2, -1]);
    const q = Array.from({ length: 4 }, (_, a) => flashFrameAt(a, true));
    expect(q).toEqual([0, 0, -1, -1]);
  });
  it('振った 向きへ ふき出す（右へ 振ると 前の 火花は 右へ・うしろの 2 つは 左へ）', () => {
    const h = createHit(makeRng(11), 'thrust', false, false);
    for (const s of h.sparks) expect(s.vx > 0).toBe(!s.back);
    const m = createHit(makeRng(11), 'thrust', true, false);
    for (const s of m.sparks) expect(s.vx < 0).toBe(!s.back);
  });
});
