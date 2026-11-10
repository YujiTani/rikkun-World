import type { WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { emptyState, type EditorState } from '../editor/model';
import { Preview3D } from './preview';
import { PREVIEW } from './tuning';
import { cueTarget, yawGap } from './view';

/**
 * HOUSE-2A（#364）AC9: 見本の こたえ（仕様 docs/design/HOUSE-2.md §2.3）。しゅるいを かえる・かざりを つける と、かわった 所が 90 コマ 光る（glow.parts）。
 *   まど・はなだん → うしろの かど（135／225 の 近い ほう）へ 回って 光る、と・のれん → まえ ＋28° へ 回って 光る、
 *   やね・かべ・えんとつ・しゃちほこ → 回らず 光る。90 コマで 消える。かざりを はずすと 光らない。
 * 本物の レンダラーは いらない（形づくりと 向きだけ。preview.test.ts と 同じ）。parts の 名前は e2e/helpers/house.ts の「2A の 約束」。
 */

const fake = {} as WebGLRenderer;
/** 新しい 項目（wall・door・deco ほか）は 型に まだ 無い ので 形を ゆるく 作る */
const st = (over: Record<string, unknown> = {}): EditorState => ({ ...emptyState(), windows: 2, wall: 'ki', door: 'ie', deco: [], ...over }) as unknown as EditorState;
const PER_FRAME = 360 / PREVIEW.lapFrames;
const FRONT_YAW = 28;

interface Glow {
  parts?: string[];
  left: number | null;
}
const glowOf = (p: Preview3D): Glow | null => (p.info('outside')?.glow ?? null) as Glow | null;
const run = (p: Preview3D, n: number): void => {
  for (let i = 0; i < n; i++) p.tick();
};

/** a の 見本を 出して 入った ときの 光り（戸）が おわる まで 進めて から b に かえる。かえた 直後の 光りと、回り終わる ころの 向きを 返す */
function change(a: EditorState, b: EditorState) {
  const p = new Preview3D(fake, () => false);
  p.setShape(a, 'outside');
  run(p, PREVIEW.glowFrames + 5);
  expect(glowOf(p), 'はじめの 戸の 光りは おわった').toBeNull();
  const yaw0 = p.info('outside')!.yaw;
  p.setShape(b, 'outside');
  const glow = glowOf(p);
  run(p, PREVIEW.turnFrames + 1);
  return { p, glow, yaw0, yaw1: p.info('outside')!.yaw };
}

describe('AC9 見本の こたえ', () => {
  const back = (yaw0: number): number => cueTarget(yaw0);
  const cases: { name: string; a: Record<string, unknown>; b: Record<string, unknown>; parts: string[]; turn: 'back' | 'front' | null }[] = [
    { name: 'まどの しゅるい', a: {}, b: { windowKind: 'suisho' }, parts: ['window'], turn: 'back' },
    { name: 'はなだんを つける', a: {}, b: { deco: ['hanadan'] }, parts: ['hanadan'], turn: 'back' },
    { name: 'との しゅるい', a: {}, b: { door: 'tetsu' }, parts: ['door'], turn: 'front' },
    { name: 'のれんを つける', a: {}, b: { deco: ['noren'] }, parts: ['noren'], turn: 'front' },
    { name: 'やねの しゅるい', a: {}, b: { roof: 'kawara' }, parts: ['roof'], turn: null },
    { name: 'かべの しゅるい', a: {}, b: { wall: 'renga' }, parts: ['wall'], turn: null },
    { name: 'えんとつを つける', a: {}, b: { deco: ['entotsu'] }, parts: ['entotsu'], turn: null },
    { name: 'しゃちほこを つける', a: {}, b: { deco: ['shachi'] }, parts: ['shachi'], turn: null },
  ];
  for (const c of cases) {
    it(`${c.name}: glow.parts ＝ ${JSON.stringify(c.parts)}・90 コマ光って 消える・${c.turn === 'back' ? 'うしろの かどへ 回る' : c.turn === 'front' ? 'まえ ＋28° へ 回る' : '回らない'}`, () => {
      const { p, glow, yaw0, yaw1 } = change(st(c.a), st(c.b));
      expect(glow, '光る').not.toBeNull();
      expect(glow!.parts).toEqual(c.parts);
      expect(glow!.left, '90 コマ から').toBe(PREVIEW.glowFrames);
      if (c.turn === 'back') expect(yawGap(yaw1, back(yaw0)), `回った さき（${yaw1.toFixed(1)}°）`).toBeLessThanOrEqual(1);
      else if (c.turn === 'front') expect(yawGap(yaw1, FRONT_YAW), `回った さき（${yaw1.toFixed(1)}°）`).toBeLessThanOrEqual(1);
      else expect(yawGap(yaw1, yaw0), `回らない（ふつうの 自動の 回りだけ）`).toBeLessThanOrEqual(PER_FRAME * (PREVIEW.turnFrames + 1) + 0.01);
      run(p, PREVIEW.glowFrames);
      expect(glowOf(p), '90 コマで 消える').toBeNull();
    });
  }

  it('かざりを はずすと 光らない（のれん・はなだん・えんとつ・しゃちほこ）', () => {
    for (const d of ['noren', 'hanadan', 'entotsu', 'shachi']) {
      expect(change(st({ deco: [] }), st({ deco: [d] })).glow, `${d} を つける と 光る`).not.toBeNull();
      expect(change(st({ deco: [d] }), st({ deco: [] })).glow, `${d} を はずす`).toBeNull();
    }
  });

  it('かわって いなければ 光らない（同じ 形を もう 1 回）', () => {
    expect(change(st({ roof: 'flat' }), st({ roof: 'kawara' })).glow, 'かえると 光る').not.toBeNull();
    expect(change(st({ roof: 'kawara' }), st({ roof: 'kawara' })).glow).toBeNull();
  });
});
