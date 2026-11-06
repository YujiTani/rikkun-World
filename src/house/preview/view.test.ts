import { describe, expect, it } from 'vitest';
import { PREVIEW } from './tuning';
import { ViewCtl, cueTarget, yawGap } from './view';

/** HOUSE-1B PR-2（AC50・AC56）: 見本の 向きの 計算。1 コマ ＝ 1/60 秒。E2E は 実際の 流れで 数が 合うかを 見る */

const OUT = PREVIEW.elevRangeDeg.outside;
const IN = PREVIEW.elevRangeDeg.inside;
const spin = { on: true };
const outside = (): ViewCtl => new ViewCtl(PREVIEW.outsideElevDeg, OUT, () => spin.on);
const inside = (): ViewCtl => new ViewCtl(PREVIEW.insideElevDeg, IN, () => spin.on);
const run = (v: ViewCtl, n: number, frozen = false): void => {
  for (let i = 0; i < n; i++) v.step(frozen);
};
const PER_FRAME = 360 / PREVIEW.lapFrames;

describe('はじめ・自動で 回る', () => {
  it('はじめは まえ ＋28°・そと 26°・なか 50°・さわって いない・wait null', () => {
    spin.on = true;
    expect(outside()).toMatchObject({ yaw: 28, elev: 26, touched: false, wait: null });
    expect(inside()).toMatchObject({ yaw: 28, elev: 50, touched: false, wait: null });
  });

  it('1 コマ 0.3°（1,200 コマで 1 周）・見おろす 角度は かわらない', () => {
    spin.on = true;
    const v = outside();
    run(v, 1);
    expect(v.yaw).toBeCloseTo(28.3, 6);
    run(v, 599);
    expect(v.yaw).toBeCloseTo(28 + 180, 4);
    run(v, 600);
    expect(v.yaw).toBeCloseTo(28, 4);
    expect(v.elev).toBe(26);
  });

  it('動きを へらす 設定では 回らない', () => {
    spin.on = false;
    const v = outside();
    run(v, 2000);
    expect(v.yaw).toBe(28);
    spin.on = true;
  });
});

describe('ドラッグ（よこ 1 px ＝ 0.5°・たて 1 px ＝ 0.5°）', () => {
  it('右へ 100 px で yaw が 50 へる（0 を こえたら 360 から）・下へ 40 px で pitch が 20 ふえる', () => {
    spin.on = true;
    const v = outside();
    v.drag(100, 0);
    expect(v.yaw).toBeCloseTo(338, 9);
    v.drag(0, 40);
    expect(v.elev).toBeCloseTo(46, 9);
    expect(v.yaw).toBeCloseTo(338, 9);
    v.drag(-100, -20);
    expect(v.yaw).toBeCloseTo(28, 9);
    expect(v.elev).toBeCloseTo(36, 9);
  });

  it('0 ぴったりは 0（360 に ならない）・そこから 右へ 4 px は 358', () => {
    spin.on = true;
    const v = outside();
    v.drag(56, 0);
    expect(v.yaw).toBe(0);
    v.drag(4, 0);
    expect(v.yaw).toBe(358);
  });

  it('見おろす 角度は そと 10〜80・なか 30〜80 で 止まり、端から 数えなおす', () => {
    spin.on = true;
    const o = outside();
    o.drag(0, 1000);
    expect(o.elev).toBe(80);
    o.drag(0, -1000);
    expect(o.elev).toBe(10);
    o.drag(0, 20);
    expect(o.elev).toBe(20);
    const n = inside();
    n.drag(0, -1000);
    expect(n.elev).toBe(30);
    n.drag(0, 1000);
    expect(n.elev).toBe(80);
    n.drag(0, -20);
    expect(n.elev).toBe(70);
  });

  it('ドラッグすると touched・wait 600（動きを へらす 設定では null の まま）', () => {
    spin.on = true;
    const v = outside();
    v.drag(10, 0);
    expect(v).toMatchObject({ touched: true, wait: 600 });
    spin.on = false;
    const r = outside();
    r.drag(10, 0);
    expect(r).toMatchObject({ touched: true, wait: null });
    spin.on = true;
  });
});

describe('wheel', () => {
  it('(dx ＋ dy) px を よこの ドラッグと 同じに。pitch は かえない', () => {
    spin.on = true;
    for (const [dx, dy, deg] of [[100, 0, -50], [0, 100, -50], [40, 60, -50], [-100, 0, 50], [-60, 20, 20]] as const) {
      const v = outside();
      v.wheel(dx, dy);
      expect(v.yaw, `${dx}, ${dy}`).toBeCloseTo(((28 + deg) % 360 + 360) % 360, 9);
      expect(v.elev).toBe(26);
      expect(v).toMatchObject({ touched: true, wait: 600 });
    }
  });

  it('1 回ごとに 600 に もどる', () => {
    spin.on = true;
    const v = outside();
    v.drag(10, 0);
    run(v, 300);
    expect(v.wait).toBe(300);
    v.wheel(0, 10);
    expect(v.wait).toBe(600);
  });
});

describe('また 回り出す（wait）', () => {
  it('はなして 599 コマは 止まり、600 コマ目で wait が null に なって その コマで 0.3° 動く', () => {
    spin.on = true;
    const v = outside();
    v.drag(100, 40);
    const { yaw, elev } = v;
    run(v, 599);
    expect(v.wait).toBe(1);
    expect(v.yaw).toBe(yaw);
    expect(v.elev).toBe(elev);
    run(v, 1);
    expect(v.wait).toBeNull();
    expect(v.touched).toBe(true);
    expect(v.yaw).toBeCloseTo(yaw + PER_FRAME, 9);
    run(v, 60);
    expect(v.yaw).toBeCloseTo(yaw + 61 * PER_FRAME, 6);
    expect(v.elev).toBe(elev);
  });

  it('押して いる 間は 600 の まま すすまない・はなすと 600 から', () => {
    spin.on = true;
    const v = inside();
    v.press();
    expect(v).toMatchObject({ touched: true, wait: 600 });
    v.drag(20, 0);
    run(v, 700);
    expect(v.wait).toBe(600);
    const yaw = v.yaw;
    run(v, 5);
    expect(v.yaw).toBe(yaw);
    v.release();
    expect(v.wait).toBe(600);
    run(v, 100);
    expect(v.wait).toBe(500);
  });

  it('動きを へらす 設定では はなしても wait は null で 回り出さない', () => {
    spin.on = false;
    const v = outside();
    v.press();
    v.drag(10, 0);
    v.release();
    run(v, 1000);
    expect(v.wait).toBeNull();
    expect(v.yaw).toBeCloseTo(28 - 5, 9);
    spin.on = true;
  });

  it('光って いる 間（frozen）も wait は へる。null に なっても 回るのは frozen が おわって から', () => {
    spin.on = true;
    const v = outside();
    v.drag(10, 0);
    run(v, 560);
    expect(v.wait).toBe(40);
    const yaw = v.yaw;
    run(v, 30, true);
    expect(v.wait).toBe(10);
    run(v, 15, true);
    expect(v.wait).toBeNull();
    expect(v.yaw).toBe(yaw);
    run(v, 1, false);
    expect(v.yaw).toBeCloseTo(yaw + PER_FRAME, 9);
  });

  it('回って いる 見本は frozen の 間 止まり、おわると また 回る', () => {
    spin.on = true;
    const v = outside();
    run(v, 10, true);
    expect(v.yaw).toBe(28);
    run(v, 10);
    expect(v.yaw).toBeCloseTo(28 + 10 * PER_FRAME, 9);
  });
});

describe('窓を 見せに 回る（turnTo・cueTarget）', () => {
  it('行き先は 135 か 225 の 近い ほう。同じ きょりなら 135', () => {
    expect(cueTarget(28)).toBe(135);
    expect(cueTarget(100)).toBe(135);
    expect(cueTarget(179)).toBe(135);
    expect(cueTarget(181)).toBe(225);
    expect(cueTarget(300)).toBe(225);
    expect(cueTarget(0)).toBe(135);
    expect(cueTarget(180), '180° は どちらも 45°').toBe(135);
    expect(cueTarget(180 + 1e-9), '計算の ずれを のみこむ').toBe(135);
    expect(cueTarget(359.9)).toBe(225);
  });

  it('yawGap は 近い ほうの まわりで 0〜180', () => {
    expect(yawGap(10, 350)).toBeCloseTo(20, 9);
    expect(yawGap(0, 180)).toBe(180);
    expect(yawGap(135, 135)).toBe(0);
  });

  it('30 コマで 行き先に ちょうど なる・途中は なめらか・pitch は かわらない・回っている 間は 自動の 回りを しない', () => {
    spin.on = true;
    const v = outside();
    v.turnTo(135, 30);
    expect(v.turning).toBe(true);
    let last = v.yaw;
    for (let i = 1; i <= 30; i++) {
      v.step(true);
      expect(v.yaw, `${i} コマ目`).toBeGreaterThan(last);
      last = v.yaw;
    }
    expect(v.yaw).toBeCloseTo(135, 9);
    expect(v.turning).toBe(false);
    expect(v.elev).toBe(26);
    run(v, 40, true);
    expect(v.yaw).toBeCloseTo(135, 9);
  });

  it('みじかい ほうの まわりで 回る（350° → 135 でなく 225 への 例: 300° → 225 は 左まわり）', () => {
    spin.on = true;
    const v = outside();
    v.drag(2 * (28 - 300), 0);
    expect(v.yaw).toBeCloseTo(300, 9);
    v.turnTo(225, 30);
    v.step(true);
    expect(v.yaw).toBeLessThan(300);
    run(v, 29, true);
    expect(v.yaw).toBeCloseTo(225, 9);
  });

  it('frames が 1 ならすぐ かわる（動きを へらす 設定）', () => {
    spin.on = true;
    const v = outside();
    v.turnTo(135, 1);
    expect(v.yaw).toBeCloseTo(135, 9);
    expect(v.turning).toBe(false);
  });

  it('回る 途中でも wait は へる・さわった 向き（touched）の まま 止まる', () => {
    spin.on = true;
    const v = outside();
    v.drag(0, 0);
    run(v, 100);
    expect(v.wait).toBe(500);
    v.turnTo(135, 30);
    run(v, 32, true);
    expect(v.yaw).toBeCloseTo(135, 9);
    expect(v.wait).toBe(468);
  });

  it('ドラッグ・押す と 回る 途中は そこで 止まる', () => {
    spin.on = true;
    const a = outside();
    a.turnTo(135, 30);
    run(a, 5, true);
    a.drag(0, 0);
    expect(a.turning).toBe(false);
    const b = outside();
    b.turnTo(135, 30);
    b.press();
    expect(b.turning).toBe(false);
  });
});

describe('見えるように なった（enter）・はじめに もどす（reset）', () => {
  it('さわって いなければ はじめの 向きから・さわった 後は その まま', () => {
    spin.on = true;
    const v = outside();
    run(v, 600);
    expect(v.yaw).toBeCloseTo(208, 4);
    v.enter();
    expect(v.yaw).toBe(28);
    v.drag(20, 10);
    const { yaw, elev } = v;
    v.enter();
    expect(v).toMatchObject({ yaw, elev, touched: true, wait: 600 });
  });

  it('reset は さわった 印・wait・向き・見おろす 角度を もどす', () => {
    spin.on = true;
    const v = inside();
    v.press();
    v.drag(50, 50);
    v.reset();
    expect(v).toMatchObject({ yaw: 28, elev: 50, touched: false, wait: null, turning: false });
    run(v, 1);
    expect(v.yaw).toBeCloseTo(28 + PER_FRAME, 9);
  });
});
