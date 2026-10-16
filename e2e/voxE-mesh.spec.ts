import { expect, test, type Page } from '@playwright/test';

/**
 * VOX-E（docs/tickets/VOX-E.md、issue #95）: hybrid メッシュをセクション（16³）ごとに本番化。
 * 受け入れ基準 1・2・3・6 を window.__rikkun だけで確かめる（テストが先。実装前は赤）。
 *
 * ── テストが使う hook（開発が実装する。くわしくは docs/tickets/VOX-E.md 「テストが使う hook」）──
 *  セクション座標 (sx, sy, sz) = (floor(x/16), floor(y/16), floor(z/16))。
 *  world.sectionInfo(sx, sy, sz): {
 *    tier: 'micro' | 'box' | 'lod' | 'none',   // いま描いている段。lod = 箱の外（列ごと 1 枚の LOD だけ）
 *    reason: 'empty' | 'hidden' | 'unlit' | null,   // tier === 'none' のときだけ理由、それ以外は null
 *    // 全部空気、または 見える面が 0 のセクションも none / "empty"
 *    meshes: number,       // いま持っている three のメッシュの数（不透明・水で 0〜2）。none / lod は 0
 *    triangles: number,    // そのセクションのメッシュの三角形の合計
 *    dist: number,         // プレイヤーから、そのセクションの水平のいちばん近い所までの距離
 *  }
 *  world.sectionStats(): {
 *    microR: number,                            // いまの小ブロックの半径（既定 32）
 *    total: number,                             // 読みこんだセクションの数
 *    micro: number, box: number, lod: number, none: number,   // 段ごとの数（合計 === total）
 *    noneBy: { empty: number, hidden: number, unlit: number }, // none の中身（合計 === none）
 *    microMaxDist: number, boxMinDist: number, boxMaxDist: number, // 段ごとの dist の幅（その段が 0 個なら 0）
 *  }
 *  world.meshStats(): {
 *    geometryBytes: number,        // いま持っているセクションのジオメトリの合計（バイト）
 *    geometryBytesLimit: number,   // 上限。これを超えたら遠い順に dispose
 *    pending: number,              // メッシュ作り直しの順番待ちの数（0 で落ちついた）。光の順番待ちは world.lightPending()
 *    meshCount: number,            // いま持っているセクションのメッシュの数
 *    disposedTotal: number,        // はじまってから dispose したジオメトリの数
 *  }
 *  world.rebuildLog(clear?: boolean): { x: number; y: number; z: number; kind: 'micro' | 'box' | 'water'; frame: number }[]
 *    // セクションのメッシュを作り直した記録（古い順）。clear === true なら、答えを返してから空にする。
 *    // 最初の全部の分もふくむ（だから、ほる前に 1 回 clear する）。光だけの作り直しもふくむ。
 */

const ASSETS = 'docs/test-reports/assets';
test.describe.configure({ timeout: 180_000 });

async function open(page: Page, query = '?nosave=1') {
  await page.addInitScript(`window.__quiet = ${QUIET_SRC};`);
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => window.__rikkun!.achievements.mute(true));
}

/** 一時停止して、妖怪と時間を固定し、メッシュと光が落ちつくまで進める */
async function settle(page: Page) {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.time.set(1000);
    h.step(2);
    h.step(10);
    (window as any).__quiet(h);
  });
}

/** ページの中で使う: 光とメッシュの順番待ちが両方 0 になるまで進める。最大 3000 コマ、超えたら理由つきで失敗 */
const QUIET_SRC = `(h) => {
  let n = 0;
  while (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) {
    if (n >= 3000) throw new Error('QUIET_TIMEOUT: lightPending=' + h.world.lightPending() + ' meshPending=' + h.world.meshStats().pending);
    h.step(5); n += 5;
  }
  h.step(2);
}`;

test.describe('VOX-E メッシュ', () => {
  test('AC1: スタートで、近くは小ブロック・その外は箱・さらに遠くは LOD（段ごとのセクション数とスクショ）', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page);
    await settle(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const s = h.world.sectionStats();
      return { s, spawn: h.world.spawn() };
    });
    console.log('AC1', JSON.stringify(r.s));
    expect(r.s.microR).toBe(32);
    // 3 つの段が、すべて「ある」
    expect(r.s.micro).toBeGreaterThan(0);
    expect(r.s.box).toBeGreaterThan(0);
    expect(r.s.lod).toBeGreaterThan(0);
    expect(r.s.micro + r.s.box + r.s.lod + r.s.none).toBe(r.s.total);
    // 段の境目: 小ブロックは r+2 以内、箱は r-2 より外〜48+2、LOD は箱より外
    expect(r.s.microMaxDist).toBeLessThanOrEqual(32 + 2);
    expect(r.s.boxMinDist).toBeGreaterThanOrEqual(32 - 2);
    expect(r.s.boxMaxDist).toBeLessThanOrEqual(48 + 2);
    // 近くの 1 つは小ブロックで、同じ大きさの箱より三角形が多い（ごつごつの形がある）
    const tri = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const sp = h.world.spawn();
      const sx = Math.floor(sp.x / 16), sz = Math.floor(sp.z / 16);
      const near = h.world.sectionInfo(sx, Math.floor(sp.y / 16), sz);
      let boxTri = 0, boxN = 0, microTri = 0, microN = 0;
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 8; z++)
          for (let x = 0; x < 8; x++) {
            const i = h.world.sectionInfo(x, y, z);
            if (i.tier === 'box') { boxTri += i.triangles; boxN++; }
            if (i.tier === 'micro') { microTri += i.triangles; microN++; }
          }
      return { near, boxAvg: boxN ? boxTri / boxN : 0, microAvg: microN ? microTri / microN : 0 };
    });
    expect(tri.near.tier).toBe('micro');
    expect(tri.near.meshes).toBeGreaterThan(0);
    expect(tri.microAvg).toBeGreaterThan(tri.boxAvg);
    // 見た目: スタートの景色と、足もとの近景（人が見て確かめる）
    await page.screenshot({ path: `${ASSETS}/VOX-E-AC1-start.png` });
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const sp = h.world.spawn();
      h.player.set({ position: { x: sp.x, y: sp.y, z: sp.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 35 });
      h.step(4);
    });
    await page.screenshot({ path: `${ASSETS}/VOX-E-AC1-ground-close.png` });
  });

  test('AC2: 全部空気・見えない・光が未計算のセクションはメッシュがない（逆に、ほかは作ってある）', async ({ page }) => {
    await open(page);
    await settle(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const sz = h.world.size();
      const nx = Math.ceil(sz.x / 16), ny = Math.ceil(sz.y / 16), nz = Math.ceil(sz.z / 16);
      const allAir = (sx: number, sy: number, sz2: number) => {
        for (let y = sy * 16; y < sy * 16 + 16; y++)
          for (let z = sz2 * 16; z < sz2 * 16 + 16; z++)
            for (let x = sx * 16; x < sx * 16 + 16; x++) if (h.world.getBlock(x, y, z) !== 'air') return false;
        return true;
      };
      let airTotal = 0, airWithoutNone = 0, noneWithMesh = 0, noneNoReason = 0, drawnNoMesh = 0, unlitNearby = 0;
      for (let sy = 0; sy < ny; sy++)
        for (let sz2 = 0; sz2 < nz; sz2++)
          for (let sx = 0; sx < nx; sx++) {
            const i = h.world.sectionInfo(sx, sy, sz2);
            const air = allAir(sx, sy, sz2);
            if (air) {
              airTotal++;
              if (!(i.tier === 'none' && i.reason === 'empty' && i.meshes === 0)) airWithoutNone++;
            }
            if (i.tier === 'none') {
              if (i.meshes !== 0) noneWithMesh++;
              if (!i.reason) noneNoReason++;
            } else if (i.tier === 'micro' || i.tier === 'box') {
              if (i.meshes === 0 && !air) drawnNoMesh++;
            }
            // 光の計算が終わったあと、近く（小ブロックの輪の中）で光が未計算のままのセクションはない
            if (i.reason === 'unlit' && i.dist <= 48) unlitNearby++;
          }
      return { airTotal, airWithoutNone, noneWithMesh, noneNoReason, drawnNoMesh, unlitNearby, stats: h.world.sectionStats() };
    });
    console.log('AC2', JSON.stringify(r));
    expect(r.airTotal).toBeGreaterThan(0); // 空の上のほうに、全部空気のセクションがある
    expect(r.airWithoutNone).toBe(0);
    expect(r.noneWithMesh).toBe(0);
    expect(r.noneNoReason).toBe(0);
    expect(r.drawnNoMesh).toBe(0);
    expect(r.unlitNearby).toBe(0);
    expect(r.stats.noneBy.empty).toBeGreaterThanOrEqual(r.airTotal);
    expect(r.stats.noneBy.empty + r.stats.noneBy.hidden + r.stats.noneBy.unlit).toBe(r.stats.none);
  });

  test('AC2/AC3: 中まで全部固いセクションは「見えない」でメッシュなし → 1 ブロックほると、そのコマか数コマでメッシュができる', async ({ page }) => {
    await open(page);
    await settle(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      // x・z 16〜79、高さ 0〜47 を石でうめる → セクション (2,1,2) は 6 方向とも固いセクションにかこまれる
      h.world.fill(16, 0, 16, 79, 47, 79, 'stone');
      (window as any).__quiet(h);
      const before = h.world.sectionInfo(2, 1, 2);
      const hiddenBefore = h.world.sectionStats().noneBy.hidden;
      h.world.rebuildLog(true);
      h.world.setBlock(40, 24, 40, 'air'); // セクション (2,1,2) の真ん中あたり
      let steps = 0;
      let after = h.world.sectionInfo(2, 1, 2);
      while (steps < 6 && after.meshes === 0) { h.step(1); steps++; after = h.world.sectionInfo(2, 1, 2); }
      (window as any).__quiet(h);
      const log = h.world.rebuildLog(true);
      const keys = new Set(log.map((e: any) => `${e.x},${e.y},${e.z}`));
      return { before, after, steps, hiddenBefore, keys: [...keys], hiddenAfter: h.world.sectionStats().noneBy.hidden };
    });
    console.log('AC3-hidden', JSON.stringify(r));
    expect(r.before).toMatchObject({ tier: 'none', reason: 'hidden', meshes: 0, triangles: 0 });
    expect(r.hiddenBefore).toBeGreaterThan(0);
    // ほったそのコマか数コマ（3 コマ以内）で穴の中の面がある
    expect(r.steps).toBeLessThanOrEqual(3);
    expect(r.after.meshes).toBeGreaterThan(0);
    expect(r.after.triangles).toBeGreaterThan(0);
    expect(r.hiddenAfter).toBeLessThan(r.hiddenBefore);
    // 作り直したのは、そのセクションだけ（まわりは固いままで見える面が増えないので、となりは作り直さない）
    expect(r.keys).toContain('2,1,2');
    expect(r.keys.length).toBe(1);
  });

  test('AC3: ブロックを 1 つほると、作り直すのはそのセクション（境目ならとなりも）だけ', async ({ page }) => {
    await open(page);
    await settle(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const sp = h.world.spawn();
      // スタート近くで、セクションの中ほど（x・z が 16 の中で 4〜11）の石か土をほる場所を、高さ 4〜11 の中で探す
      let spot: { x: number; y: number; z: number } | null = null;
      const bx = Math.floor(sp.x / 16) * 16, bz = Math.floor(sp.z / 16) * 16;
      const solid = (x: number, y: number, z: number) => { const b = h.world.getBlock(x, y, z); return b !== 'air' && b !== 'water' && b !== 'outside'; };
      // セクションの真ん中（x・z が 16 の中で 6〜9）で、上下左右の 6 方向が固い所（ほると閉じた穴になる）を探す
      for (let dz = 0; dz < 4 && !spot; dz++)
        for (let dx = 0; dx < 4 && !spot; dx++)
          for (const y of [8, 6, 10, 5, 11]) {
            const x = bx + 6 + dx, z = bz + 6 + dz;
            if (solid(x, y, z) && solid(x + 1, y, z) && solid(x - 1, y, z) && solid(x, y + 1, z) && solid(x, y - 1, z) && solid(x, y, z + 1) && solid(x, y, z - 1)) {
              spot = { x, y, z };
              break;
            }
          }
      if (!spot) return { noSpot: true } as any;
      const sec = [Math.floor(spot.x / 16), Math.floor(spot.y / 16), Math.floor(spot.z / 16)];
      const info0 = h.world.sectionInfo(sec[0], sec[1], sec[2]);
      h.world.rebuildLog(true);
      h.world.setBlock(spot.x, spot.y, spot.z, 'air');
      let steps = 0;
      let info = h.world.sectionInfo(sec[0], sec[1], sec[2]);
      while (steps < 3 && info.triangles === info0.triangles) { h.step(1); steps++; info = h.world.sectionInfo(sec[0], sec[1], sec[2]); }
      (window as any).__quiet(h);
      const interior = h.world.rebuildLog(true);
      const interiorKeys = [...new Set(interior.map((e: any) => `${e.x},${e.y},${e.z}`))];
      // 境目のブロック: セクションの右はし（x % 16 === 15）。となりは sx+1 のセクション。1 回だけ変える
      const edge = { x: sec[0] * 16 + 15, y: spot.y, z: spot.z };
      const edgeWas = h.world.getBlock(edge.x, edge.y, edge.z);
      h.world.rebuildLog(true);
      h.world.setBlock(edge.x, edge.y, edge.z, edgeWas === 'air' ? 'stone' : 'air');
      (window as any).__quiet(h);
      const border = h.world.rebuildLog(true);
      const borderKeys = [...new Set(border.map((e: any) => `${e.x},${e.y},${e.z}`))];
      const edgeNow = h.world.getBlock(edge.x, edge.y, edge.z);
      // ふちから 2 つ目（x % 16 === 1）: 小ブロック地形は となり 2 ブロック先まで読むので、左のとなりも作り直す
      const near = { x: sec[0] * 16 + 1, y: spot.y, z: spot.z };
      const nearWas = h.world.getBlock(near.x, near.y, near.z);
      h.world.rebuildLog(true);
      h.world.setBlock(near.x, near.y, near.z, nearWas === 'air' ? 'stone' : 'air');
      (window as any).__quiet(h);
      const nearKeys = [...new Set(h.world.rebuildLog(true).map((e: any) => `${e.x},${e.y},${e.z}`))];
      const nearNow = h.world.getBlock(near.x, near.y, near.z);
      return { edge, edgeWas, edgeNow, near, nearWas, nearNow, nearKeys, spot, sec, steps, info0, info, interiorKeys, borderKeys };
    });
    console.log('AC3', JSON.stringify(r));
    expect(r.noSpot).toBeUndefined();
    // 見える面が、そのコマか数コマ（3 コマ以内）で変わる
    expect(r.steps).toBeLessThanOrEqual(3);
    expect(r.info.triangles).not.toBe(r.info0.triangles);
    // 中ほど: そのセクションだけ（ふつうは 1 つ。穴の光が上のセクションのメッシュに影響しても、まわりの 1 つまで）
    expect(r.interiorKeys).toContain(r.sec.join(','));
    expect(r.interiorKeys.length).toBe(1); // 閉じた穴は、そのセクションだけ（ちがう kind は同じセクション）
    expect(r.edgeNow).not.toBe(r.edgeWas);
    expect(r.edge.x % 16).toBe(15);
    // 境目: そのセクション＋となり 1 つ（合わせて 2 つ）まで
    expect(r.borderKeys.length).toBeGreaterThanOrEqual(1);
    expect(r.borderKeys.length).toBeLessThanOrEqual(2);
    // ふちから 2 つ目（lx=1）: そのセクション＋左のとなり（合わせて 2 つ）
    expect(r.nearNow).not.toBe(r.nearWas);
    expect(r.nearKeys).toContain(r.sec.join(','));
    expect(r.nearKeys).toContain([r.sec[0] - 1, r.sec[1], r.sec[2]].join(','));
    expect(r.nearKeys.length).toBeLessThanOrEqual(2);
    // どちらも、遠くのセクションは作り直さない
    for (const k of [...r.interiorKeys, ...r.borderKeys, ...r.nearKeys]) {
      const [x, y, z] = k.split(',').map(Number);
      expect(Math.abs(x - r.sec[0]) + Math.abs(y - r.sec[1]) + Math.abs(z - r.sec[2])).toBeLessThanOrEqual(2);
    }
  });

  test('AC6: 歩いて遠くなったメッシュは捨てる（dispose する・geometryBytes が上限で止まる）', async ({ page }) => {
    await open(page);
    await settle(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const corners: [number, number][] = [[3.5, 3.5], [124.5, 3.5], [124.5, 124.5], [3.5, 124.5]];
      const lap = () => {
        let max = 0;
        const perCorner: number[] = [];
        const farMesh: number[] = [];
        for (const [x, z] of corners) {
          const gy = h.world.groundHeight(Math.floor(x), Math.floor(z));
          h.player.set({ position: { x, y: gy + 2, z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
          h.step(40);
          (window as any).__quiet(h);
          const gb = h.world.meshStats().geometryBytes;
          perCorner.push(gb);
          max = Math.max(max, gb);
          // いまの場所から 96 より遠いセクションに、メッシュはない
          let n = 0;
          for (let y = 0; y < 3; y++)
            for (let sz = 0; sz < 8; sz++)
              for (let sx = 0; sx < 8; sx++) {
                const i = h.world.sectionInfo(sx, y, sz);
                if (i.dist > 52 && i.meshes > 0) n++;
              }
          farMesh.push(n);
        }
        return { max, farMesh, perCorner };
      };
      const start = h.world.meshStats();
      const a = lap();
      const mid = h.world.meshStats();
      const b = lap();
      const c = lap();
      const end = h.world.meshStats();
      return { start, a, mid, b, c, end };
    });
    console.log('AC6', JSON.stringify(r));
    // 遠くなったものを捨てている
    expect(r.end.disposedTotal).toBeGreaterThan(r.start.disposedTotal);
    expect(r.mid.disposedTotal).toBeGreaterThan(0);
    // 箱の外（52 より遠い）にセクションのメッシュは残っていない
    for (const n of [...r.a.farMesh, ...r.b.farMesh, ...r.c.farMesh]) expect(n).toBe(0);
    // geometryBytes は上限をこえず、2 周目・3 周目で増え続けない
    expect(r.end.geometryBytesLimit).toBeGreaterThan(0);
    for (const m of [r.a.max, r.b.max, r.c.max]) expect(m).toBeLessThanOrEqual(r.end.geometryBytesLimit);
    // 落ちついたあとは、同じ場所で同じ大きさ（時間にゆれない）。周をかさねても増えない
    expect(r.c.perCorner).toEqual(r.b.perCorner);
    expect(r.end.meshCount).toBeLessThanOrEqual(Math.max(r.mid.meshCount, r.start.meshCount) * 2);
  });
});
