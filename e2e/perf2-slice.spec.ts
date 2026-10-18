import { expect, test, type Page } from '@playwright/test';
import { openStream, settleWorld } from './helpers/stream';

/**
 * PERF-2（issue #201、docs/tickets/PERF-2.md テスト 3）: 小ブロックの 1 セクションを 分けて作っても 見た目は 1 画素も変わらない。
 * 実装の前は赤（`render.meshDigest`・`world.meshJob`・`?meshSlice=off` が まだ無い）。
 *  - `?clock=time` の 分ける道 と、`&meshSlice=off`（分けない道）を それぞれ 落ちつくまで進める。
 *  - 落ちついたあとの 最後の状態だけで比べる（コマ数は 見ない）: meshDigest が同じ・画面ぜんぶの 画素が同じ・分けた方は slices > 0。
 * 角度・座標は 決め打ちせず、時刻・カメラ・妖怪なしは ゲームに聞いてそろえる。
 */
test.setTimeout(120_000);

const BASE = '?nosave=1&microR=16&clock=time';

interface Shot {
  digest: { sections: number; hash: string };
  job: { active: unknown; finished: number; cancelled: number; slices: number; maxSliceMs: number };
  width: number;
  height: number;
  /** 画面ぜんぶの 画素の 行ごとの FNV-1a（ちがう行が分かるように）と、全部のバイト数 */
  rows: string[];
  pending: number;
  cam: unknown;
}

async function settleAll(page: Page): Promise<void> {
  await settleWorld(page, true);
  const left = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    let n = 0;
    while (h.world.meshStats().pending > 0 && n < 6000) {
      h.step(5);
      n += 5;
    }
    h.step(2);
    return h.world.meshStats().pending as number;
  });
  expect(left, '落ちついたあと、作り直し待ちが 0').toBe(0);
}

async function shoot(page: Page, query: string): Promise<Shot> {
  await openStream(page, query);
  expect(await page.evaluate(() => (window as any).__rikkun.clock()), 'この確かめは time の時計').toBe('time');
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.yokai.clear();
    h.lock.simulate(true);
  });
  await settleAll(page);
  return page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.time.set(6000); // ひる（空の暗さをそろえる）
    // 見下ろしカメラ: プレイヤーの板（待機アニメ。settle のコマ数で位相がちがう）を 描かない。地形の絵だけを くらべる
    h.camera.overview(true);
    h.yokai.clear();
    h.step(2);
    const digest = h.render.meshDigest();
    const job = h.world.meshJob();
    const cam = h.camera.get();
    // 画面ぜんぶ: いま 1 回 描いて、すぐ 同じ場で 読む（描いた直後でないと 消える）
    h.render.pixel(0, 0);
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGL2RenderingContext;
    const px = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const rows: string[] = [];
    const rowBytes = canvas.width * 4;
    for (let y = 0; y < canvas.height; y++) {
      let a = 0x811c9dc5;
      for (let i = y * rowBytes; i < (y + 1) * rowBytes; i++) a = Math.imul(a ^ px[i], 0x01000193);
      rows.push((a >>> 0).toString(16));
    }
    return {
      digest,
      job,
      width: canvas.width,
      height: canvas.height,
      rows,
      pending: h.world.meshStats().pending,
      cam,
    };
  });
}

test.describe('PERF-2 分けて作っても 見た目が同じ', () => {
  test('分ける道と 分けない道で meshDigest が同じ・画面の画素が 1 つもちがわない・分けた方は 本当に分けた', async ({ browser }) => {
    const pageA = await (await browser.newContext()).newPage();
    const pageB = await (await browser.newContext()).newPage();
    const sliced = await shoot(pageA, BASE);
    const whole = await shoot(pageB, BASE + '&meshSlice=off');

    expect(sliced.pending).toBe(0);
    expect(whole.pending).toBe(0);
    expect(sliced.job.slices, '分けた方は 分けた道を通った').toBeGreaterThan(0);
    expect(whole.job.slices, 'meshSlice=off は 分けない').toBe(0);
    expect(sliced.digest.sections, '見えているセクション').toBeGreaterThan(0);
    expect(sliced.digest.hash.length).toBeGreaterThan(0);
    expect(sliced.digest, 'meshDigest').toEqual(whole.digest);

    expect(sliced.cam, 'カメラ').toEqual(whole.cam);
    expect([sliced.width, sliced.height]).toEqual([whole.width, whole.height]);
    expect(sliced.rows.length, '画面の高さ').toBeGreaterThan(0);
    const badRows = sliced.rows.flatMap((r, y) => (r !== whole.rows[y] ? [y] : []));
    expect(badRows, '画素がちがう行（画面ぜんぶで 1 画素も ちがわない）').toEqual([]);

    await pageA.context().close();
    await pageB.context().close();
  });
});
