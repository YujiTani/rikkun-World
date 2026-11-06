import { describe, expect, it } from 'vitest';
import { decideTitleReturn } from './titleReturn';

const base = { enabled: true, nosave: false, failuresBefore: 0, failuresAfter: 0, held: false, dirty: false };

describe('タイトルにもどる', () => {
  it('保存できたら読みこむ。ほぞんしたとは判断しない（reload だけ）', () => {
    expect(decideTitleReturn(base)).toBe('reload');
  });
  it('失敗が増えたら残る', () => {
    expect(decideTitleReturn({ ...base, failuresAfter: 1 })).toBe('stay');
  });
  it('保存できないのに nosave でもないときは残る', () => {
    expect(decideTitleReturn({ ...base, enabled: false })).toBe('stay');
  });
  it('nosave は読みこんでよい', () => {
    expect(decideTitleReturn({ ...base, enabled: false, nosave: true, dirty: true, held: true })).toBe('reload');
  });
  it('保存を止めているあいだに変更があると残る', () => {
    expect(decideTitleReturn({ ...base, held: true, dirty: true })).toBe('stay');
  });
  it('止めていても変更がなければ読みこむ', () => {
    expect(decideTitleReturn({ ...base, held: true, dirty: false })).toBe('reload');
  });
});
