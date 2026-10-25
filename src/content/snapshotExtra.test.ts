import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { norm } from './snapshot';
import { buildBlocksSnapshot, buildDropsSnapshot, buildIdsSnapshot, buildOrderSnapshot, buildSettingsSnapshot, buildTuningSnapshot } from './snapshotExtra';

// #310 段階 0c: 表まるごと・並び順・設定の初期値・id の一覧の写し。差分が出たら値・順番・id が変わったということ（意図した変更だけ更新する）
const text = (o: object): string => JSON.stringify(o, null, 2) + '\n';

describe('content snapshot（その 2）', () => {
  it('ブロック（番号の並び・掘る数・落とすもの）', async () => {
    await expect(text(buildBlocksSnapshot())).toMatchFileSnapshot('./__snapshots__/blocks.json');
  });
  it('ドロップ（めずらしさ・妖怪のドロップ表・ヌシ）', async () => {
    await expect(text(buildDropsSnapshot())).toMatchFileSnapshot('./__snapshots__/drops.json');
  });
  it('妖怪・ボスの調整表', async () => {
    await expect(text(buildTuningSnapshot())).toMatchFileSnapshot('./__snapshots__/tuning.json');
  });
  it('並び順（アイテム・レシピ・カテゴリー・本・実績）', async () => {
    await expect(text(buildOrderSnapshot())).toMatchFileSnapshot('./__snapshots__/order.json');
  });
  it('設定フックの入れ物の初期値', async () => {
    await expect(text(buildSettingsSnapshot())).toMatchFileSnapshot('./__snapshots__/settings.json');
  });
  it('id の一覧（アイテム・レシピ・実績・統計キー）', async () => {
    await expect(text(buildIdsSnapshot())).toMatchFileSnapshot('./__snapshots__/ids.json');
  });

  it('norm: 有限でない数・undefined は JSON で null と区別できる文字になる（本物の null はそのまま）', () => {
    const out = JSON.parse(JSON.stringify(norm({ a: Infinity, b: -Infinity, c: NaN, d: undefined, e: null, f: [Infinity, undefined, null], g: 0 })));
    expect(out).toEqual({ a: 'Infinity', b: '-Infinity', c: 'NaN', d: 'undefined', e: null, f: ['Infinity', 'undefined', null], g: 0 });
  });

  // settings.json の hint・aimCfg・dig の名前は main.ts の流れ（game/wire/*.ts）から書き写した物。そこを変えたら、ここで落ちて気づく
  it('main.ts の流れから書き写した設定（dig の名前・hint・aimCfg）が元と同じ', () => {
    const main = ['../game/wire/combat.ts', '../game/wire/ui.ts', '../debug/settingsViews.ts'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
    const settings = buildSettingsSnapshot() as { hint: unknown; aimCfg: unknown; dig: Record<string, unknown> };
    expect(main).toMatch(/^\s*const aimCfg = \{ aimAssistDeg: 4 \};$/m);
    expect(settings.aimCfg).toEqual({ aimAssistDeg: 4 });
    expect(main).toMatch(/^\s*const hintSettings = \{ actionHint: true \};$/m);
    expect(settings.hint).toEqual({ actionHint: true });
    const arr = /function digSettingsView\([^)]*\)[^{]*\{\s*const names = \[([^\]]*)\] as const;/.exec(main);
    expect(arr, 'digSettingsView の names 配列が見つからない').not.toBeNull();
    const names = [...arr![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(Object.keys(settings.dig).sort()).toEqual([...names].sort());
  });
});
