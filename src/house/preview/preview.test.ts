import type { WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { emptyState } from '../editor/model';
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
