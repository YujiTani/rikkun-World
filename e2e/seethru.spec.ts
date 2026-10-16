import { expect, test, type Page } from '@playwright/test';

/**
 * SEETHRU（docs/tickets/SEETHRU.md、issue #142）: 段差の下が空の色にすけて見える。
 * 受け入れ基準 E1〜E3 を、ゲーム（window.__rikkun）に聞いて確かめる。実装前は赤。
 *
 * ── 確かめ方 ──
 *  1. 島の一角（x 40〜87、z 40〜87）を world.fill で 手作りの地形（段差・かべ・くぼみ）に作りかえる。場所は決め打ち。
 *     小ブロックの形は位置から決まる（乱数のシード付き）ので、いつも同じ形になる。
 *  2. 光とメッシュの順番待ち（lightPending・meshStats().pending）が 0 になるまで進める（最大 3000 コマ、超えたら失敗）。
 *  3. 段差の足もとに立って、斜め下を見た絵を撮る（HUD はかくす）。z を変えて 5 か所×面からの距離 2 とおり。
 *  4. 絵の中の「空の色（水色）のかたまり」の大きさを数える。地面・土・かべ・草は 水色にならない。
 *     穴があると、地面の中ごしに 空が 帯になって見える（実装前の数: 1 枚の絵で かたまり 数十〜数百ピクセル）。
 *     いちばん大きいかたまりが 25 ピクセル未満なら すけていない（ふちの 1〜数ピクセルの すきまは ここでは数えない）。
 *  0. 判定式そのもの（水色の判定）が 昼の空の色を ちゃんと見つけることを、最初に確かめる（E0。陽性対照）。
 *     実装後は「0 が正解」なので、判定がずれると 穴があっても緑になってしまう。
 *  新しい hook は いらない（sectionInfo・meshStats・lightPending・rebuildLog・player.set・world.fill で足りる）。
 *
 * ユニットテスト（src/world/render/voxel/seeThrough.test.ts）が「面が全部ある」を数で確かめる。
 * こちらは「実際の絵で すけない」ことと、メッシュが小ブロックの段で できていることを確かめる。
 */

const ASSETS = 'docs/test-reports/assets';
test.describe.configure({ timeout: 180_000 });

const TOP = 24;
/** 段差の面の x（これより小さい x が低い側）。プレイヤーから 32 以内（小ブロックの輪の中） */
const WALL_X = 64;
const Z_VIEWS = [64, 60, 68, 56, 72];

/** ページの中で使う: 光とメッシュの順番待ちが両方 0 になるまで進める。最大 3000 コマ、超えたら理由つきで失敗 */
const QUIET_SRC = `(h) => {
  let n = 0;
  while (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) {
    if (n >= 3000) throw new Error('QUIET_TIMEOUT: lightPending=' + h.world.lightPending() + ' meshPending=' + h.world.meshStats().pending);
    h.step(5); n += 5;
  }
  h.step(2);
}`;

/** ページの中で使う: 空の色（水色）の判定式。絵の判定（BLOBS_SRC）と 陽性対照（E0）で 同じものを使う */
const IS_SKY_SRC = `(r, g, b) => b >= 170 && b > r + 30 && b > g - 10`;

/** ページの中で使う: 絵（PNG の base64）の中の「水色」のかたまり（8 近傍でつながったピクセル）のいちばん大きいもの・25 以上のかたまりの数・水色の合計 */
const BLOBS_SRC = `async (b64) => {
  const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
  const bmp = await createImageBitmap(blob);
  const W = bmp.width, H = bmp.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const Y0 = 150; // 上のほう（空・地平線・かべの向こう）は 見ない。段差の足もとは y 300〜450 に写る
  const sky = new Uint8Array(W * H);
  let total = 0;
  for (let y = Y0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (window.__isSky(d[i], d[i + 1], d[i + 2])) { sky[y * W + x] = 1; total++; }
  }
  let largest = 0, big = 0;
  const stack = [];
  for (let p = Y0 * W; p < W * H; p++) {
    if (sky[p] !== 1) continue;
    let size = 0; sky[p] = 2; stack.push(p);
    while (stack.length) {
      const q = stack.pop(); size++;
      const qx = q % W, qy = (q - qx) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < Y0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (sky[n] === 1) { sky[n] = 2; stack.push(n); }
      }
    }
    if (size > largest) largest = size;
    if (size >= 25) big++;
  }
  return { largest, big, total };
}`;

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(`window.__quiet = ${QUIET_SRC}; window.__isSky = ${IS_SKY_SRC}; window.__blobs = ${BLOBS_SRC};`);
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
}

/** 一時停止して、妖怪と時間を固定し、島の一角（x 40〜87、z 40〜87）を 平らな地面（高さ TOP）にする */
async function flatArea(page: Page) {
  await page.evaluate((TOP) => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.time.set(1000);
    h.step(12);
    const W = h.world;
    W.fill(40, 1, 40, 87, TOP - 3, 87, 'stone');
    W.fill(40, TOP - 2, 40, 87, TOP - 1, 87, 'dirt');
    W.fill(40, TOP, 40, 87, TOP, 87, 'grass');
    W.fill(40, TOP + 1, 40, 87, 47, 87, 'air');
  }, TOP);
  await page.addStyleTag({ content: '#hud{display:none !important}' });
}

/** 東がわ（x >= x0）を 高さ top の地面にする（段差の面は x = x0 に立つ） */
async function plateau(page: Page, x0: number, top: number) {
  await page.evaluate(
    ([x0, top]) => {
      const W = (window as any).__rikkun.world;
      W.fill(x0, 1, 40, 87, top - 3, 87, 'stone');
      W.fill(x0, top - 2, 40, 87, top - 1, 87, 'dirt');
      W.fill(x0, top, 40, 87, top, 87, 'grass');
    },
    [x0, top],
  );
}

async function settle(page: Page) {
  await page.evaluate(() => (window as any).__quiet((window as any).__rikkun));
}

interface Seen {
  z: number;
  dx: number;
  largest: number;
  big: number;
  total: number;
}

/** 段差の面（x = wallX）の足もとから、z と 面からの距離を変えて 見た絵のすけ具合を数える。1 枚目の絵は shot に保存 */
async function look(page: Page, wallX: number, zs: number[], shot: string): Promise<Seen[]> {
  const seen: Seen[] = [];
  let first = true;
  for (const z of zs) {
    for (const dx of [-1.5, -3]) {
      const locked = await page.evaluate(
        ([x, z]) => {
          const h = (window as any).__rikkun;
          h.player.set({ position: { x, y: 25, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -40 });
          h.step(40);
          return h.lock.get().locked as boolean;
        },
        [wallX + dx, z + 0.5],
      );
      expect(locked, `ゲームがロックを失った（z=${z}）。カメラが動かないので テストにならない`).toBe(true);
      const buf = await page.screenshot(first ? { path: shot } : {});
      first = false;
      const r = (await page.evaluate(`(window.__blobs)("${buf.toString('base64')}")`)) as { largest: number; big: number; total: number };
      seen.push({ z, dx, ...r });
    }
  }
  return seen;
}

/** メッシュが落ちついていて、足もとのセクションが 小ブロックの段で 面を持っている */
async function expectMicroMeshes(page: Page, x: number, z: number, ys: number[]) {
  const r = await page.evaluate(
    ([x, z, ys]) => {
      const h = (window as any).__rikkun;
      const sx = Math.floor((x as number) / 16);
      const sz = Math.floor((z as number) / 16);
      return {
        pending: h.world.meshStats().pending as number,
        light: h.world.lightPending() as number,
        infos: (ys as number[]).map((y) => h.world.sectionInfo(sx, Math.floor(y / 16), sz) as { tier: string; meshes: number; triangles: number }),
      };
    },
    [x, z, ys] as const,
  );
  expect(r.pending).toBe(0);
  expect(r.light).toBe(0);
  for (const info of r.infos) {
    expect(info.tier).toBe('micro');
    expect(info.meshes).toBeGreaterThan(0);
    expect(info.triangles).toBeGreaterThan(0);
  }
}

const fmt = (s: Seen[]) => s.map((e) => `z${e.z}/dx${e.dx}: 最大${e.largest}px 大${e.big}こ 合計${e.total}px`).join(' | ');

function expectNoSky(label: string, seen: Seen[]) {
  const largest = Math.max(...seen.map((e) => e.largest));
  const big = seen.reduce((a, e) => a + e.big, 0);
  console.log(label, fmt(seen));
  expect(largest, `${label}: 空の色のかたまり 最大 ${largest}px（段差の下の面が ぬけている）。${fmt(seen)}`).toBeLessThan(25);
  expect(big).toBe(0);
}

test.describe('SEETHRU: 段差の下が空の色にすけない（#142）', () => {
  test('E0（陽性対照）: 判定式は 昼の空の色を 水色と判定し、地面・土・石・れんが・白は 水色と判定しない。空を見上げた絵では 大きな水色のかたまりが見つかる', async ({ page }) => {
    await open(page);
    await flatArea(page);
    await settle(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const isSky = (window as any).__isSky as (r: number, g: number, b: number) => boolean;
      const hex = h.time.get().skyColor as string; // 昼（dayTick 1000）の空の色。例 '#8FD3FF'
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const notSky = { 草: [86, 166, 58], 土: [134, 86, 56], 石: [136, 133, 128], れんが: [176, 78, 62], 白: [255, 255, 255] };
      return { hex, rgb, sky: isSky(rgb[0], rgb[1], rgb[2]), notSky: Object.entries(notSky).filter(([, c]) => isSky(c[0], c[1], c[2])).map(([k]) => k) };
    });
    expect(r.hex, '昼の空の色が 変わった（判定式を見直す）').toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(r.sky, `昼の空の色 ${r.hex}（${r.rgb}）が 水色の判定式を通らない`).toBe(true);
    expect(r.notSky, '地面などの色が 水色と判定された').toEqual([]);
    // 空を見上げた絵: 絵の判定（かたまり数え）が 大きな水色のかたまりを見つける（実装後に 0 が正解のテストが 空振りしないため）
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x: 62.5, y: 25, z: 64.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 60 });
      h.step(40);
    });
    const buf = await page.screenshot();
    const blobs = (await page.evaluate(`(window.__blobs)("${buf.toString('base64')}")`)) as { largest: number; total: number };
    console.log('E0 空を見上げた絵', JSON.stringify(blobs));
    expect(blobs.largest, '空を見上げた絵で 水色のかたまりが 見つからない（かたまり数えが動いていない）').toBeGreaterThan(100_000);
  });

  for (const diff of [1, 2, 3]) {
    test(`E1: 崖 ${diff} ブロック: 崖の足もとの固いブロックの面があり、絵で空の色がすけない`, async ({ page }) => {
      await open(page);
      await flatArea(page);
      await plateau(page, WALL_X, TOP + diff);
      await settle(page);
      await expectMicroMeshes(page, WALL_X - 2, 64, [TOP - 1]); // y 16〜31 = セクション (3,1,4)
      expectNoSky(`E1 diff=${diff}`, await look(page, WALL_X, Z_VIEWS, `${ASSETS}/SEETHRU-cliff${diff}.png`));
    });
  }

  test('E2: 建物の下: 草の上の れんが のかべの下の草ブロックの面があり、絵で すけない', async ({ page }) => {
    await open(page);
    await flatArea(page);
    await page.evaluate(
      ([x, top]) => {
        (window as any).__rikkun.world.fill(x, top + 1, 40, x, top + 3, 87, 'brick');
      },
      [WALL_X, TOP],
    );
    await settle(page);
    await expectMicroMeshes(page, WALL_X - 2, 64, [TOP]); // かべの下の草（y=24）。かべそのもの（y 25〜27）も同じセクション
    expectNoSky('E2', await look(page, WALL_X, Z_VIEWS, `${ASSETS}/SEETHRU-brick.png`));
  });

  test('E3: ほったら でこぼこ: 広くほると ほった所が作り直され、くぼみのふちも すけない', async ({ page }) => {
    await open(page);
    await flatArea(page);
    await settle(page);
    // セクション (3,1,4) = x 48〜63, y 16〜31, z 64〜79。平らな地面の ほる前
    const before = await page.evaluate(() => (window as any).__rikkun.world.sectionInfo(3, 1, 4).triangles as number);
    // x 52〜63、z 52〜76 の草 1 ブロックぶんをほる（深さ 1 のくぼみ。東のふち x=64 に 1 ブロックの段差ができる）
    await page.evaluate(
      ([top]) => {
        const h = (window as any).__rikkun;
        h.world.rebuildLog(true);
        h.world.fill(52, top, 52, 63, top, 76, 'air');
      },
      [TOP],
    );
    await settle(page);
    const after = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return { tri: h.world.sectionInfo(3, 1, 4).triangles as number, log: h.world.rebuildLog(true) as { x: number; y: number; z: number }[] };
    });
    // ほった所は 土が新しい表面になり、小ブロック地形（でこぼこ）で描かれる（ほったセクションが作り直されて 三角形が変わる）
    expect(after.log.some((e) => e.x === 3 && e.y === 1 && e.z === 4), 'ほったセクションが作り直されていない').toBe(true);
    expect(after.tri).not.toBe(before);
    await expectMicroMeshes(page, 56, 64, [TOP - 1]);
    // くぼみの中から 東のふち（x=64 の草のかべの下の 土）を見る
    expectNoSky('E3', await look(page, WALL_X, Z_VIEWS, `${ASSETS}/SEETHRU-dig.png`));
  });
});
