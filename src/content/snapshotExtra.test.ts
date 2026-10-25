import { describe, expect, it } from 'vitest';
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
});
