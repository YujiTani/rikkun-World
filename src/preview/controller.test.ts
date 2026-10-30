import { describe, expect, it } from 'vitest';
import { ALLOWED_TEXT, BUTTON_TEXTS, DOLL_LABEL, PAGE_TITLE } from './texts';
import { COURSE_START_X, FIXED_DT, PreviewController, REVIVE_SECONDS, SPIN_SECONDS, STAIR_X, yokaiX } from './controller';
import { Chochin } from '../yokai';
import { COURSE } from '../yokai';

function run(c: PreviewController, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) c.update(FIXED_DT);
}

describe('見本ページ', () => {
  it('AC1: 妖怪 4 体と人形が左から順に 4 ブロックおきに並ぶ', () => {
    const c = new PreviewController();
    expect(c.yokai.map((y) => y.id)).toEqual(['karakasa', 'chochin', 'nurikabe', 'rokurokubi', 'tako_hachimaki']);
    expect(c.doll.group.visible).toBe(true);
    const xs = c.anchors.filter((a) => a.kind === 'yokai').map((a) => a.position.x);
    expect(xs[1]! - xs[0]!).toBe(4);
    expect(xs[3]! - xs[2]!).toBe(4);
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

  it('うごくはその場で動く（からかさだけ段のコースを進む）', () => {
    const c = new PreviewController();
    c.setMotion('move');
    run(c, 3);
    for (const y of c.yokai) expect(y.root.position.length()).toBe(0);
  });

  it('AC8: からかさは段の上に着地し、段は高さ 2・からかさの右どなり', () => {
    const c = new PreviewController();
    expect(STAIR_X).toBeGreaterThan(yokaiX(0));
    expect(STAIR_X).toBeLessThan(yokaiX(1));
    c.setMotion('move');
    let onStep = false;
    for (let i = 0; i < Math.round(COURSE.cycle / FIXED_DT); i++) {
      c.update(FIXED_DT);
      const y = c.karakasa.info().bodyY;
      if (y > 1.99 && Math.abs(c.karakasaX() - STAIR_X) < 0.5) onStep = true;
    }
    expect(onStep).toBe(true);
    expect(COURSE_START_X).toBeLessThan(STAIR_X);
  });

  it('こうげき: 回転を止めて前を向き、当たりの瞬間に赤い線が 0.2 秒出る', () => {
    const c = new PreviewController();
    run(c, 100);
    c.setMotion('attack');
    expect(c.rotating).toBe(false);
    expect(c.yaw).toBe(0);
    expect(c.yokai.every((y) => y.motion === 'attack')).toBe(true);
    run(c, 0.45);
    expect(c.hitVisible(0)).toBe(false);
    run(c, 0.1);
    expect(c.hitVisible(0)).toBe(true);
    expect(c.hitVisible(3)).toBe(true);
    expect(c.attackView).toBe(true);
    run(c, 0.25);
    expect(c.hitVisible(0)).toBe(false);
  });

  it('ちょうちんの火の玉は見本ページの世界（stage）に出る', () => {
    const c = new PreviewController();
    c.setMotion('attack');
    run(c, 0.6);
    const ch = c.yokai[1] as Chochin;
    expect(ch.fireballs[0]!.group.parent).toBe(c.stage);
    expect(ch.fireballs[0]!.alive).toBe(true);
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

  it('AC10: 画面の文字はひらがな・カタカナ・数字だけ', () => {
    const c = new PreviewController();
    const texts = [PAGE_TITLE, DOLL_LABEL, ...Object.values(BUTTON_TEXTS), ...c.yokai.map((y) => y.displayName), '1', '2', '3', '4'];
    for (const t of texts) expect(t).toMatch(ALLOWED_TEXT);
  });
});
