import { describe, expect, it } from 'vitest';
import { ALLOWED_TEXT, BUTTON_TEXTS, DOLL_LABEL, PAGE_TITLE } from './texts';
import { FIXED_DT, PreviewController, REVIVE_SECONDS, SPIN_SECONDS } from './controller';

function run(c: PreviewController, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) c.update(FIXED_DT);
}

describe('見本ページ', () => {
  it('AC1: 妖怪 4 体と人形が左から順に 3 ブロックおきに並ぶ', () => {
    const c = new PreviewController();
    expect(c.yokai.map((y) => y.id)).toEqual(['karakasa', 'chochin', 'nurikabe', 'rokurokubi']);
    expect(c.doll.group.visible).toBe(true);
    const xs = c.anchors.filter((a) => a.kind === 'yokai').map((a) => a.position.x);
    expect(xs[1]! - xs[0]!).toBe(3);
    expect(xs[3]! - xs[2]!).toBe(3);
    expect(c.anchors[0]!.position.x).toBeLessThan(xs[0]!);
  });

  it('AC3: かげで全部まっ黒、名前が消えて番号。いろで元にもどる', () => {
    const c = new PreviewController();
    c.setSilhouette(true);
    for (const y of c.yokai) expect(y.displayColors()).toEqual(['#000000']);
    expect(c.dollIsSilhouette).toBe(true);
    c.setSilhouette(false);
    for (const y of c.yokai) expect(y.displayColors().length).toBeGreaterThan(1);
  });

  it('AC4: 動きのボタンで動きが変わり、たおれると 1.6 秒でまた出る', () => {
    const c = new PreviewController();
    c.setMotion('move');
    expect(c.yokai.every((y) => y.motion === 'move')).toBe(true);
    c.setMotion('attack');
    expect(c.yokai.every((y) => y.motion === 'attack')).toBe(true);
    c.setMotion('wait');
    c.setMotion('die');
    run(c, 0.65);
    expect(c.yokai.every((y) => y.scale === 0)).toBe(true);
    run(c, REVIVE_SECONDS - 0.65 - 0.05);
    expect(c.yokai.every((y) => y.motion === 'die')).toBe(true);
    run(c, 0.1);
    expect(c.yokai.every((y) => y.motion === 'wait' && y.scale === 1)).toBe(true);
  });

  it('AC4: うごくはその場で動く（前に進まない）', () => {
    const c = new PreviewController();
    c.setMotion('move');
    run(c, 3);
    for (const y of c.yokai) expect(y.root.position.length()).toBe(0);
  });

  it('AC5: 1 回転 8 秒。とめるで止まり、まえ・よこで正面・真横', () => {
    const c = new PreviewController();
    run(c, SPIN_SECONDS / 4);
    expect(c.yaw).toBeCloseTo(Math.PI / 2, 1);
    c.setRotating(false);
    const y0 = c.yaw;
    run(c, 2);
    expect(c.yaw).toBe(y0);
    c.setView('front');
    expect(c.yaw).toBe(0);
    c.setView('side');
    expect(c.yaw).toBeCloseTo(Math.PI / 2);
    c.setRotating(true);
    run(c, 1);
    expect(c.yaw).toBeGreaterThan(Math.PI / 2);
  });

  it('AC6: 画面の文字はひらがな・カタカナ・数字だけ', () => {
    const c = new PreviewController();
    const texts = [PAGE_TITLE, DOLL_LABEL, ...Object.values(BUTTON_TEXTS), ...c.yokai.map((y) => y.displayName), '1', '2', '3', '4'];
    for (const t of texts) expect(t).toMatch(ALLOWED_TEXT);
  });
});
