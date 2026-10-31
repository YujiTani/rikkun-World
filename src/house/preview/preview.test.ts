import type { WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { emptyState, type EditorState, type Placed } from '../editor/model';
import { buildPreview } from './mesh';
import { Preview3D } from './preview';
import { PREVIEW } from './tuning';

/**
 * HOUSE-1B PR-2: 見本を 押して いる 間の 片づけ。ドラッグの 途中で すすみが かわっても、はなした とき 押した 見本の 手が はなれる。
 * 描かない 部分だけ 使う ので 本物の レンダラーは いらない（形づくりと 向きだけ）
 */
const fake = {} as WebGLRenderer;
const make = (): Preview3D => new Preview3D(fake, () => false);
const state = emptyState();

describe('見本を 押して いる 間に 見せ方が かわる', () => {
  it('押した まま すすみを かえて もどり、はなしても 600 コマで 止まらない（押した 見本の 手が はなれる）', () => {
    const p = make();
    p.setShape(state, 'outside');
    expect(p.press()).toBe(true);
    p.setShape(state, 'inside'); // ② へ（押した まま）
    p.release();
    p.setShape(state, 'outside'); // ① へ もどる
    expect(p.info('outside')).toMatchObject({ touched: true, wait: PREVIEW.resumeFrames });
    p.tick();
    expect(p.info('outside')?.wait, '押しっぱなしの まま 止まって いない').toBe(PREVIEW.resumeFrames - 1);
    expect(p.info('inside')?.touched, '押して いない ② は さわって いない').toBe(false);
  });

  it('はなす 前に ③ へ 行って もどっても、はなせば 600 コマの 数えが すすむ', () => {
    const p = make();
    p.setShape(state, 'inside');
    p.press();
    p.hide(); // ③
    p.release();
    p.setShape(state, 'inside');
    p.tick();
    expect(p.info('inside')?.wait).toBe(PREVIEW.resumeFrames - 1);
  });

  it('押して いない のに はなしても 何も かわらない', () => {
    const p = make();
    p.setShape(state, 'outside');
    p.release();
    expect(p.info('outside')).toMatchObject({ touched: false, wait: null });
  });

  it('押した あと はじめに もどした（restart）なら、はなしても 600 コマの 数えが 始まらない', () => {
    const p = make();
    p.setShape(state, 'outside');
    p.press();
    p.restart();
    p.release();
    expect(p.info('outside')).toMatchObject({ touched: false, wait: null });
  });

  it('押したまま 別の 見せ方で 押しなおすと、前に 押した 手は はなれる', () => {
    const p = make();
    p.setShape(state, 'outside');
    p.press();
    p.setShape(state, 'inside');
    p.press();
    p.release();
    p.setShape(state, 'outside');
    p.tick();
    expect(p.info('outside')?.wait).toBe(PREVIEW.resumeFrames - 1);
    p.setShape(state, 'inside');
    p.tick();
    expect(p.info('inside')?.wait).toBe(PREVIEW.resumeFrames - 1);
  });
});

/**
 * HOUSE-1E〔#374〕AC13g: 赤い 家具は 見本（3D）に 出さない。ふつうの 色に なったら 出る。
 * `info(mode).furniture` ＝ 見本に 出して いる 家具の 数（窓口 `editor().preview.furniture` の もと）
 */
describe('見本に 赤い 家具を 出さない（1E）', () => {
  const chair: Placed = { kind: 'chair', x: 0, z: 0, rot: 0 };
  const redFuton: Placed = { kind: 'futon', x: 4, z: 4, rot: 0 }; // 足が 方眼の 外 ＝ out
  const okFuton: Placed = { kind: 'futon', x: 3, z: 4, rot: 1 }; // 右下の すみを 向きで おさめた 形
  const redDoor: Placed = { kind: 'chair', x: 2, z: 4, rot: 0 }; // 戸の 前 ＝ door
  const withFurniture = (furniture: Placed[]): EditorState => ({ ...emptyState(), furniture });
  /** PreviewInfo.furniture（1E で 足す） */
  const shownOf = (p: Preview3D): number | undefined => (p.info('inside') as unknown as { furniture?: number }).furniture;
  const faces = (s: EditorState): number => buildPreview(s, 'inside').base.faceCount;

  it('buildPreview(inside): 赤い 家具の 面は ふえない。ふつうの 家具の 面は ふえる', () => {
    const none = faces(withFurniture([]));
    const one = faces(withFurniture([chair]));
    expect(one, 'ふつうの 家具は 出る').toBeGreaterThan(none);
    expect(faces(withFurniture([chair, redFuton])), 'はみ出した ふとん').toBe(one);
    expect(faces(withFurniture([chair, redFuton, redDoor])), '戸の 前の いす').toBe(one);
    expect(faces(withFurniture([chair, { kind: 'chair', x: 0, z: 0, rot: 0 }])), '重なって 赤い 2 つとも').toBe(none);
    expect(faces(withFurniture([chair, okFuton])), 'ふつうに なったら 出る').toBeGreaterThan(one);
  });

  it('info(inside).furniture ＝ 出して いる 数（赤を のぞく）。赤い 家具だけ ふえても 作りなおさない。ふつうに なると 数が ふえ、作りなおしが 1 回', () => {
    const p = make();
    p.setShape(withFurniture([chair, redFuton]), 'inside');
    expect(shownOf(p), '5×5 に いす（ふつう）と ふとん（赤）').toBe(1);
    const builds = p.info('inside').builds;
    p.setShape(withFurniture([chair, redFuton, redDoor]), 'inside');
    expect(shownOf(p)).toBe(1);
    expect(p.info('inside').builds, '赤い 家具が ふえても 見本は かわらない').toBe(builds);
    p.setShape(withFurniture([chair, okFuton, redDoor]), 'inside');
    expect(shownOf(p), 'ふとんを ↻ で ふつうに').toBe(2);
    expect(p.info('inside').builds).toBe(builds + 1);
  });
});
