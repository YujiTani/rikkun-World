import { describe, expect, it } from 'vitest';
import { parseBlueprint } from './blueprint';
import { emptyState, parseState } from './model';

/** 1E: せっけいずに 赤い 家具は 入らない。保存から 読む ときも 赤い 家具は すてる（作りかけの 下書き〔parseState〕は 赤も のこす） */
describe('parseBlueprint: 赤い 家具', () => {
  const raw = {
    ...emptyState(),
    number: 3,
    furniture: [
      { kind: 'chair', x: 0, z: 0, rot: 0 },
      { kind: 'nukunuku', x: 4, z: 4, rot: 0 }, // 5×5 の 右下の すみで はみ出す（2×2）
    ],
  };

  it('ふつうの 家具だけ のこる。番号・ほかの 形は そのまま', () => {
    const bp = parseBlueprint(raw);
    expect(bp?.number).toBe(3);
    expect(bp?.furniture.map((f) => f.kind)).toEqual(['chair']);
  });

  it('下書き（parseState）は 赤い 家具も のこす', () => {
    expect(parseState(raw).furniture.map((f) => f.kind)).toEqual(['chair', 'nukunuku']);
  });
});
