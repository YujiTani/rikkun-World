import type { WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { emptyState, type EditorState } from '../editor/model';
import { Preview3D } from './preview';
import { PREVIEW } from './tuning';
import { cueTarget, yawGap } from './view';

/**
 * HOUSE-2A（#364・仕様 3 版 docs/design/HOUSE-2.md §2.3）AC8: 見本の こたえ。しゅるいを かえる・かざりを つける と、かわった 所が 90 コマ 光る（glow.parts）。
 *   まど・はなだん → うしろの かど（135／225 の 近い ほう）へ 回って 光る、と・のれん → まえ ＋28° へ 回って 光る、
 *   やね・かべ・えんとつ・しゃちほこ → 回らず 光る。同じ 形の 案の 入れかえ（むら → おしろ）でも 光る。90 コマで 消える。かざりを はずすと 光らない。
 *   ② あかりを かえると 見本の あかりが 1 回 光る（parts ['light']。回らない）。
 *   ポップアップの しゅるいの ボタンに のせて いる 間は、その ばしょの 今の 物が 光る（回らない。のせている 間は left が null。はなすと 消える）。
 * 本物の レンダラーは いらない（形づくりと 向きだけ。preview.test.ts と 同じ）。parts の 名前・hover(on, part) は e2e/helpers/house.ts の「2A の 約束」。
 */

const fake = {} as WebGLRenderer;
/** 新しい 項目（wall・door・deco・light ほか）は 型に まだ 無い ので 形を ゆるく 作る */
const st = (over: Record<string, unknown> = {}): EditorState => ({ ...emptyState(), windows: 2, wall: 'ki', door: 'ie', deco: [], light: 'lantern', ...over }) as unknown as EditorState;
const PER_FRAME = 360 / PREVIEW.lapFrames;
const FRONT_YAW = 28;

type Mode = 'outside' | 'inside';
interface Glow {
  parts?: string[];
  left: number | null;
}
interface P3 {
  hover(on: boolean, part?: string): void;
}
const glowOf = (p: Preview3D, mode: Mode = 'outside'): Glow | null => (p.info(mode)?.glow ?? null) as Glow | null;
const run = (p: Preview3D, n: number): void => {
  for (let i = 0; i < n; i++) p.tick();
};

/** a の 見本を 出して 入った ときの 光り（戸）が おわる まで 進めて から b に かえる。かえた 直後の 光りと、回り終わる ころの 向きを 返す */
function change(a: EditorState, b: EditorState, mode: Mode = 'outside') {
  const p = new Preview3D(fake, () => false);
  p.setShape(a, mode);
  run(p, PREVIEW.glowFrames + 5);
  expect(glowOf(p, mode), 'はじめの 光りは おわった').toBeNull();
  const yaw0 = p.info(mode)!.yaw;
  p.setShape(b, mode);
  const glow = glowOf(p, mode);
  run(p, PREVIEW.turnFrames + 1);
  return { p, glow, yaw0, yaw1: p.info(mode)!.yaw };
}

describe('AC8 見本の こたえ（そと）', () => {
  const back = (yaw0: number): number => cueTarget(yaw0);
  const cases: { name: string; a: Record<string, unknown>; b: Record<string, unknown>; parts: string[]; turn: 'back' | 'front' | null }[] = [
    { name: 'まどの しゅるい', a: {}, b: { windowKind: 'suisho_mura' }, parts: ['window'], turn: 'back' },
    { name: 'まどの 案の 入れかえ（むら → おしろ）', a: { windowKind: 'suisho_mura' }, b: { windowKind: 'suisho_shiro' }, parts: ['window'], turn: 'back' },
    { name: 'はなだんを つける', a: {}, b: { deco: ['hanadan_mura'] }, parts: ['hanadan'], turn: 'back' },
    { name: 'はなだんの 案の 入れかえ（むら → こうざん）', a: { deco: ['hanadan_mura'] }, b: { deco: ['hanadan_kozan'] }, parts: ['hanadan'], turn: 'back' },
    { name: 'との しゅるい', a: {}, b: { door: 'tetsu_mura' }, parts: ['door'], turn: 'front' },
    { name: 'との 案の 入れかえ（むら → おしろ）', a: { door: 'tetsu_mura' }, b: { door: 'tetsu_shiro' }, parts: ['door'], turn: 'front' },
    { name: 'のれんを つける', a: {}, b: { deco: ['noren_mura'] }, parts: ['noren'], turn: 'front' },
    { name: 'のれんの 案の 入れかえ（おしろ → こうざん）', a: { deco: ['noren_shiro'] }, b: { deco: ['noren_kozan'] }, parts: ['noren'], turn: 'front' },
    { name: 'やねの しゅるい', a: {}, b: { roof: 'kawara_mura' }, parts: ['roof'], turn: null },
    { name: 'やねの 案の 入れかえ（むら → おしろ）', a: { roof: 'kawara_mura' }, b: { roof: 'kawara_shiro' }, parts: ['roof'], turn: null },
    { name: 'やねの 形の 入れかえ（かわら → さんかく）', a: { roof: 'kawara_mura' }, b: { roof: 'sankaku_mura' }, parts: ['roof'], turn: null },
    { name: 'かべの しゅるい', a: {}, b: { wall: 'renga_mura' }, parts: ['wall'], turn: null },
    { name: 'かべの 案の 入れかえ（おしろ → こうざん）', a: { wall: 'renga_shiro' }, b: { wall: 'renga_kozan' }, parts: ['wall'], turn: null },
    { name: 'えんとつを つける', a: {}, b: { deco: ['entotsu_mura'] }, parts: ['entotsu'], turn: null },
    { name: 'えんとつの 案の 入れかえ（むら → おしろ）', a: { deco: ['entotsu_mura'] }, b: { deco: ['entotsu_shiro'] }, parts: ['entotsu'], turn: null },
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

  it('かざりを はずすと 光らない（のれん・はなだん・えんとつ・しゃちほこ）。つけると 光る', () => {
    for (const d of ['noren_kozan', 'hanadan_shiro', 'entotsu_mura', 'shachi']) {
      expect(change(st({ deco: [] }), st({ deco: [d] })).glow, `${d} を つける と 光る`).not.toBeNull();
      expect(change(st({ deco: [d] }), st({ deco: [] })).glow, `${d} を はずす`).toBeNull();
    }
  });

  it('かわって いなければ 光らない（同じ 形を もう 1 回）', () => {
    expect(change(st({ roof: 'flat' }), st({ roof: 'kawara_shiro' })).glow, 'かえると 光る').not.toBeNull();
    expect(change(st({ roof: 'kawara_shiro' }), st({ roof: 'kawara_shiro' })).glow).toBeNull();
  });
});

describe('AC9c 「なし」を えらんだ ときは 光らない（はずした かざりと 同じ）。まど なしは うしろの かどへ 回る だけ', () => {
  const noGlow = (g: Glow | null): boolean => g === null || (g.parts?.length ?? 0) === 0;
  it('やね なし・かべ なし: 光らず 回らない', () => {
    for (const over of [{ roof: 'none' }, { wall: 'none' }]) {
      const { glow, yaw0, yaw1 } = change(st(), st(over));
      expect(noGlow(glow), JSON.stringify(over)).toBe(true);
      expect(yawGap(yaw1, yaw0), '回らない').toBeLessThanOrEqual(PER_FRAME * (PREVIEW.turnFrames + 1) + 0.01);
    }
  });

  it('まど なし: 光らず、うしろの かどへ 回る（まどの かずが あるとき）', () => {
    const { glow, yaw0, yaw1 } = change(st(), st({ windowKind: 'none' }));
    expect(noGlow(glow)).toBe(true);
    expect(yawGap(yaw1, cueTarget(yaw0)), `回った さき（${yaw1.toFixed(1)}°）`).toBeLessThanOrEqual(1);
  });

  it('なしから いつもの 物へ もどす（たいら）と ふつうの しゅるい 変更と 同じに 光る', () => {
    expect(change(st({ roof: 'none' }), st({ roof: 'flat' })).glow?.parts).toEqual(['roof']);
  });
});

describe('AC8 ② あかりを かえると 見本の あかりが 1 回 光る', () => {
  for (const [from, to] of [['lantern', 'hotaru'], ['hotaru', 'suisho'], ['suisho', 'lantern']] as const) {
    it(`${from} → ${to}: なかの 見本で glow.parts ＝ ['light']・90 コマで 消える・回らない`, () => {
      const { p, glow, yaw0, yaw1 } = change(st({ light: from }), st({ light: to }), 'inside');
      expect(glow, '光る').not.toBeNull();
      expect(glow!.parts).toEqual(['light']);
      expect(glow!.left, '90 コマ から').toBe(PREVIEW.glowFrames);
      expect(yawGap(yaw1, yaw0), '回らない（ふつうの 自動の 回りだけ）').toBeLessThanOrEqual(PER_FRAME * (PREVIEW.turnFrames + 1) + 0.01);
      run(p, PREVIEW.glowFrames);
      expect(glowOf(p, 'inside'), '90 コマで 消える').toBeNull();
    });
  }

  it('同じ あかりを もう 1 回 なら 光らない。② に はいった だけでも 光らない。そとの 見本で あかりが かわっても そとは 光らない（かえた ときは 光る）', () => {
    expect(change(st({ light: 'lantern' }), st({ light: 'hotaru' }), 'inside').glow, 'かえると 光る').not.toBeNull();
    expect(change(st({ light: 'hotaru' }), st({ light: 'hotaru' }), 'inside').glow).toBeNull();
    const p = new Preview3D(fake, () => false);
    p.setShape(st({ light: 'hotaru' }), 'outside');
    run(p, PREVIEW.glowFrames + 5);
    p.setShape(st({ light: 'hotaru' }), 'inside');
    expect(glowOf(p, 'inside'), '② に はいった だけ').toBeNull();
    expect(change(st({ light: 'lantern' }), st({ light: 'suisho' }), 'outside').glow, 'そとの 見本には あかりは 出ない').toBeNull();
  });
});

describe('AC8 ポップアップの しゅるいの ボタンに のせて いる 間は その ばしょが 光る（回らない）', () => {
  /** 光り 1 回が おわった そとの 見本を 作る */
  function shown(over: Record<string, unknown> = {}) {
    const p = new Preview3D(fake, () => false);
    p.setShape(st(over), 'outside');
    run(p, PREVIEW.glowFrames + 5);
    return p;
  }
  it('ひらいた ばかりの 戸の 光りが のこって いても、のせたら その ばしょの 光りが 出る（はなすと 消える）', () => {
    const p = new Preview3D(fake, () => false);
    p.setShape(st(), 'outside');
    run(p, 20);
    expect(glowOf(p)?.parts, '戸の 光り').toBeUndefined();
    (p as unknown as P3).hover(true, 'roof');
    expect(glowOf(p)?.parts).toEqual(['roof']);
    expect(glowOf(p)?.left).toBeNull();
    (p as unknown as P3).hover(false);
    expect(glowOf(p), 'はなすと 消える').toBeNull();
  });
  for (const part of ['roof', 'wall', 'window', 'door', 'entotsu', 'noren', 'hanadan', 'shachi']) {
    it(`${part}: のせる と glow.parts ＝ ['${part}']・left は null（のせて いる 間 ずっと）・回らない。はなすと 消える`, () => {
      const p = shown({ deco: ['entotsu_mura', 'noren_shiro', 'hanadan_kozan', 'shachi'] });
      const yaw0 = p.info('outside')!.yaw;
      (p as unknown as P3).hover(true, part);
      const g = glowOf(p);
      expect(g, 'のせた').not.toBeNull();
      expect(g!.parts).toEqual([part]);
      expect(g!.left, 'のせて いる 間').toBeNull();
      run(p, PREVIEW.turnFrames + 1);
      expect(yawGap(p.info('outside')!.yaw, yaw0), '回らない（ふつうの 自動の 回りだけ）').toBeLessThanOrEqual(PER_FRAME * (PREVIEW.turnFrames + 1) + 0.01);
      run(p, PREVIEW.glowFrames * 4);
      expect(glowOf(p)?.parts, '600 コマ のせても そのまま').toEqual([part]);
      (p as unknown as P3).hover(false);
      expect(glowOf(p), 'はなすと 消える').toBeNull();
    });
  }
});
