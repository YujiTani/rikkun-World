import type { Page } from '@playwright/test';
import { blockLightBrightness, lightBrightness } from '../../src/world/light/curve';
import { LIGHT_CONFIG } from '../../src/world/light/config';
import { SCENERY_CONFIG } from '../../src/game/config';
import { fine } from './fine';

/**
 * TEX-A（#146、docs/tickets/TEX-A.md）の E2E の共通の道具。
 *
 * ── 使う hook（`window.__rikkun.render.*`。開発が足す。形は TEX-A.md「テストが使う hook」）──
 *   faceShade / flatBlocks / texelAt / aoAt / toScreen / pixel / blobShadow / aoStats / setAo
 *   + このテストが頼む追加: setBlobShadow(on: boolean)（基準 8 の「くつの画素は影の ON / OFF で同じ」用）
 *
 * ── 画素の読み方 ──
 *   たくさんの画素は、1 コマ描いた画面の スクリーンショット（PNG）を 1 回だけ読み、ページの中で配列にしておく（`grab`）。
 *   1 画素ごとに hook の `pixel` を呼ぶと 1 回ごとに 1 コマ描いて SwiftShader では遅いため。
 *   `render.pixel` は スクリーンショットと同じ値を返すことを 基準 1 で 1 回だけ くらべる。
 *
 * ── 色の式（DESIGN 3 章・4.1）──
 *   画素 = sRGB( 線形(タイルの sRGB) × 面の明るさ(1) × AO(2) × 光 )。`expectedRgb` がこれ。
 */

export type Face = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';
export type Rgb = [number, number, number];
export interface Texel {
  tile: string;
  px: number;
  py: number;
  rgb: Rgb;
}

/** (1) 面の明るさ（DESIGN 3.1）。north = −z */
export const FACE_SHADE: Record<Face, number> = { top: 1, bottom: 0.5, north: 0.8, south: 0.8, east: 0.6, west: 0.6 };

/** 平らな箱で描く 13 種（道具 7 種 DESIGN 5.3 + LIVE-2 のこたつ・小屋 2 ブロック + こたつ 2×2 の のこり 3 マス。3 マス は 1 つ だけ 置くと ふつう の 箱。さく・とびら は LIVE-2.1 で 板 に なった ので 入らない） */
export const FLAT_BLOCKS = ['brick', 'farmland', 'farmland_wet', 'furnace', 'kawara', 'nukunuku', 'nukunuku_e', 'nukunuku_s', 'nukunuku_se', 'sprinkler', 'tansu', 'toriya_box', 'toriya_nest'];

/** 空の色の見分け方（TEX-A.md 基準 9・13） */
export const isSky = (r: number, g: number, b: number): boolean => b > r + 40 && b > 180 && g > 150;

export const lin = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
export const enc = (l: number): number => {
  const v = Math.max(0, Math.min(1, l));
  return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
};
/** タイルの色 × 面の明るさ × AO × 光（光は 色ごとの数でもよい） */
export function expectedRgb(tile: Rgb, shade: number, light: number | Rgb = 1, ao = 1): Rgb {
  const lt: Rgb = typeof light === 'number' ? [light, light, light] : light;
  return [0, 1, 2].map((i) => enc(lin(tile[i]) * shade * ao * lt[i])) as Rgb;
}
/** 各チャンネル tol 以内か */
export const near = (a: ArrayLike<number>, b: ArrayLike<number>, tol: number): boolean =>
  [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) <= tol);
/** 線形の明るさ（0.2126R + 0.7152G + 0.0722B）。比べるときは線形にもどしてから */
export const linLum = (c: ArrayLike<number>): number => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

/**
 * 光の式（world/light/curve.ts と lightShader.ts と同じ）: 空の光 sky・時刻の弱まり darken・ブロックの光 block → 色ごとの数。
 * 明るさ = max(空の光の曲線, ブロックの光の 3 だんかい)。ブロックの光が空の光より明るいと 暖かい色あいがかかる。
 */
export function lightTriple(sky: number, darken: number, block: number): Rgb {
  return lightTripleWith(sky, darken, block, NIGHT_SKY_MUL);
}

/** #76 夜の暗さ(C): 空の光の曲線に かける 夜の倍率（docs/decisions/2026-10-23-night-darker.md）。夜の外 = 0.125 × 0.16 ≈ 0.02 */
export const NIGHT_SKY_MUL = 0.16;

/**
 * 夜の倍率を変えられる光の式。#76 の前の式（倍率 1）は `lightTripleBefore`。
 * 空の光の曲線 sb に mix(1, mul, nt × w) をかける。nt = darken ÷ nightDarken（夜の度合い 0〜1）、w = clamp(空の光 ÷ 4, 0, 1)（どうくつは かけない）
 */
export function lightTripleWith(sky: number, darken: number, block: number, mul: number): Rgb {
  const nt = Math.max(0, Math.min(1, darken / LIGHT_CONFIG.nightDarken));
  const w = Math.max(0, Math.min(1, sky / 4));
  const sb = lightBrightness(Math.max(0, sky - darken)) * (1 + (mul - 1) * nt * w);
  const bb = blockLightBrightness(block);
  const ww = Math.max(0, Math.min(1, (bb - sb) * 3)) * LIGHT_CONFIG.warmTintStrength;
  const t = LIGHT_CONFIG.warmTint;
  const m = Math.max(sb, bb);
  return [m * (1 + (t[0] - 1) * ww), m * (1 + (t[1] - 1) * ww), m * (1 + (t[2] - 1) * ww)];
}

/** #76 の前の光の式（夜の倍率なし）。「今より暗い」をくらべる見本 */
export const lightTripleBefore = (sky: number, darken: number, block: number): Rgb => lightTripleWith(sky, darken, block, 1);

/** ページの中で使う: 光とメッシュの順番待ちが 0 になるまで進める（e2e/voxE-mesh.spec.ts の settle と同じ）。最大 3000 コマ */
export const QUIET_SRC = `(h) => {
  let n = 0;
  while (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) {
    if (n >= 3000) throw new Error('QUIET_TIMEOUT: lightPending=' + h.world.lightPending() + ' meshPending=' + h.world.meshStats().pending);
    h.step(5); n += 5;
  }
  h.step(2);
}`;

/** 開く: 1280×720、一時停止、妖怪なし、昼（時刻 1000）、HUD をかくす、キャラの絵の読みこみを待つ、落ちつくまで進める */
export async function openTex(page: Page, query = '?nosave=1'): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(`window.__quiet = ${QUIET_SRC};`);
  await page.goto('/' + fine(query)); // 画素・AO・段を見るので、細かいメッシュのまま（#180）
  await page.waitForFunction(() => window.__rikkun?.ready === true, null, { timeout: 0 });
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    h.pause();
    h.lock.simulate(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.time.set(1000);
    h.step(12);
    (window as any).__quiet(h);
  });
  // キャラの板の絵の読みこみ（非同期）を待つ。待つあいだは 描画を止め、時間の上限は テスト全体にまかせる
  await page.evaluate(() => (window as any).__rikkun.suspendRender(true));
  try {
    await page.waitForFunction(
      () => {
        const d = (window as any).__rikkun.player.doll?.();
        // 読みこみに失敗したとき（status.idle === 'failed'）は 代わりの絵になるので 待たない
        return !d || !d.sprite || d.sprite.loaded === true || d.sprite.status?.idle === 'failed';
      },
      null,
      { timeout: 0 },
    );
  } finally {
    await page.evaluate(() => (window as any).__rikkun.suspendRender(false));
  }
  await page.addStyleTag({ content: '#hud, .hud, [data-ui], .rk-hud { visibility: hidden !important; }' });
  await page.evaluate(() => (window as any).__rikkun.step(2));
}

/** 落ちつくまで進める */
export async function quiet(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__quiet((window as any).__rikkun));
}

/** プレイヤーを置いて 1 コマ進める（速度 0） */
export async function setPose(page: Page, x: number, y: number, z: number, yaw: number, pitch: number): Promise<void> {
  await page.evaluate(
    ({ x, y, z, yaw, pitch }) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch });
      h.step(1);
    },
    { x, y, z, yaw, pitch },
  );
}

/**
 * 景色を撮るときの置き方: プレイヤーを置く → メッシュが落ちつくまで進める → もう一度置く（落ちてずれないように）→ 1 コマ。
 * paint-shots.mjs の VIEWS と同じ手順。
 */
export async function setPoseSettled(page: Page, x: number, y: number, z: number, yaw: number, pitch: number): Promise<void> {
  await setPose(page, x, y, z, yaw, pitch);
  await quiet(page);
  await setPose(page, x, y, z, yaw, pitch);
}

// ---------------------------------------------------------------- 画面の画素（スクリーンショットから）

/** いまのコマのスクリーンショットを撮って、ページの中の window.__shot に { w, h, data(RGBA) } で入れる */
export async function grab(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__rikkun.step(1));
  const buf = await page.screenshot({ type: 'png' });
  await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height);
    (window as any).__shot = { w: bmp.width, h: bmp.height, data: d.data };
  }, buf.toString('base64'));
}

/** grab したコマの画素（画面の外は null） */
export async function shotPixels(page: Page, pts: { x: number; y: number }[]): Promise<(Rgb | null)[]> {
  return page.evaluate((pts) => {
    const s = (window as any).__shot;
    return pts.map((p) => {
      const x = Math.round(p.x - 0.5);
      const y = Math.round(p.y - 0.5);
      if (x < 0 || y < 0 || x >= s.w || y >= s.h) return null;
      const i = (y * s.w + x) * 4;
      return [s.data[i], s.data[i + 1], s.data[i + 2]] as [number, number, number];
    });
  }, pts);
}

/** ワールドの点を画面の点にする（hook の toScreen）。まとめて */
export async function toScreenMany(page: Page, pts: { x: number; y: number; z: number }[]): Promise<{ x: number; y: number; onScreen: boolean }[]> {
  return page.evaluate((pts) => {
    const r = (window as any).__rikkun.render;
    return pts.map((p) => r.toScreen(p.x, p.y, p.z));
  }, pts);
}

/**
 * 4 つの角（ワールドの点）でかこんだ四角の中の、画面の画素の平均（sRGB のバイト値）。n×n の点を 双線形に ならべて読む。
 * 角は [左下, 右下, 右上, 左上] のどの順でも よい（四角として つながる順）。1 点でも 画面の外なら null。
 */
export async function quadMean(page: Page, corners: { x: number; y: number; z: number }[], n = 16): Promise<{ mean: Rgb; count: number; skyCount: number } | null> {
  const sc = await toScreenMany(page, corners);
  if (sc.some((s) => !s.onScreen)) return null;
  const pts: { x: number; y: number }[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const v = (j + 0.5) / n;
      const px = (1 - v) * ((1 - u) * sc[0].x + u * sc[1].x) + v * ((1 - u) * sc[3].x + u * sc[2].x);
      const py = (1 - v) * ((1 - u) * sc[0].y + u * sc[1].y) + v * ((1 - u) * sc[3].y + u * sc[2].y);
      pts.push({ x: px, y: py });
    }
  const px = await shotPixels(page, pts);
  const ok = px.filter((p): p is Rgb => p !== null);
  const sum = [0, 0, 0];
  let sky = 0;
  for (const p of ok) {
    if (isSky(p[0], p[1], p[2])) sky++;
    for (let i = 0; i < 3; i++) sum[i] += p[i];
  }
  return { mean: sum.map((s) => s / Math.max(1, ok.length)) as Rgb, count: ok.length, skyCount: sky };
}

/** 面（ブロック (bx,by,bz) のどの向き）の 4 つの角。quadMean に渡す */
export function faceCorners(bx: number, by: number, bz: number, face: Face): { x: number; y: number; z: number }[] {
  const x0 = bx, x1 = bx + 1, y0 = by, y1 = by + 1, z0 = bz, z1 = bz + 1;
  const P = (x: number, y: number, z: number) => ({ x, y, z });
  switch (face) {
    case 'top': return [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)];
    case 'bottom': return [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)];
    case 'north': return [P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0)];
    case 'south': return [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
    case 'east': return [P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1)];
    case 'west': return [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)];
  }
}

/** 面のタイルの 16×16 の画素の中心を、ワールドの点にする（面の上の点。上下 = (x,z)・東西 = (z,y)・南北 = (x,y)。向きは texelAt が決める） */
export function faceGridPoints(bx: number, by: number, bz: number, face: Face, n = 4, inner = false): { x: number; y: number; z: number }[] {
  const pts: { x: number; y: number; z: number }[] = [];
  // 16 画素の中心 (k + 0.5) / 16 のうち、n × n 個（0.5/16 から 15.5/16 を等間隔に。n = 4 なら k = 1, 5, 9, 13 → 中心 (k + 0.5) / 16）
  // inner: ふちの 4 画素ぶんは のぞく（でこぼこの ふちでは 斜めから見ると 向こうがわの床が見えるため）
  const ks = Array.from({ length: n }, (_, i) => (inner ? 4 + Math.floor((i * 8) / n + 8 / n / 2 - 0.5) : Math.floor((i * 16) / n + 16 / n / 2 - 0.5)));
  for (const b of ks)
    for (const a of ks) {
      const ua = (a + 0.5) / 16;
      const ub = (b + 0.5) / 16;
      switch (face) {
        case 'top': pts.push({ x: bx + ua, y: by + 1, z: bz + ub }); break;
        case 'bottom': pts.push({ x: bx + ua, y: by, z: bz + ub }); break;
        case 'north': pts.push({ x: bx + ua, y: by + ub, z: bz }); break;
        case 'south': pts.push({ x: bx + ua, y: by + ub, z: bz + 1 }); break;
        case 'east': pts.push({ x: bx + 1, y: by + ub, z: bz + ua }); break;
        case 'west': pts.push({ x: bx, y: by + ub, z: bz + ua }); break;
      }
    }
  return pts;
}

/** カメラから見て、そのブロックの面は 表か（カメラの位置が面の外がわ） */
export function faceFacesCamera(cam: { x: number; y: number; z: number }, bx: number, by: number, bz: number, face: Face): boolean {
  switch (face) {
    case 'top': return cam.y > by + 1;
    case 'bottom': return cam.y < by;
    case 'north': return cam.z < bz;
    case 'south': return cam.z > bz + 1;
    case 'east': return cam.x > bx + 1;
    case 'west': return cam.x < bx;
  }
}

// ---------------------------------------------------------------- 基準 13: 形の見やすさの点数

/**
 * 点数（TEX-A.md 基準 13・docs/art/texture-back.md 5 章）:
 *   L = 0.2126R + 0.7152G + 0.0722B（バイト値のまま）。空（isSky）を 9×9 でぼかした所と 画面のふち 8 画素は のぞく。
 *   B = L を 9×9 の箱でぼかした物。点数 = std(B) ÷ std(L − B)。
 * grab したコマ（window.__shot）で 計る。
 */
export async function legibilityScore(page: Page): Promise<number> {
  return page.evaluate(() => {
    const s = (window as any).__shot as { w: number; h: number; data: Uint8ClampedArray };
    const { w, h, data } = s;
    const L = new Float64Array(w * h);
    const sky = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      L[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sky[i] = b > r + 40 && b > 180 && g > 150 ? 1 : 0;
    }
    const R = 4; // 9×9
    // 積分画像で 9×9 の箱（ふちは 画面の中だけで平均）
    const integral = (src: ArrayLike<number>): Float64Array => {
      const I = new Float64Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
          row += src[y * w + x];
          I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
        }
      }
      return I;
    };
    const box = (I: Float64Array, x: number, y: number): { sum: number; n: number } => {
      const x0 = Math.max(0, x - R), x1 = Math.min(w - 1, x + R), y0 = Math.max(0, y - R), y1 = Math.min(h - 1, y + R);
      const sum = I[(y1 + 1) * (w + 1) + x1 + 1] - I[y0 * (w + 1) + x1 + 1] - I[(y1 + 1) * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      return { sum, n: (x1 - x0 + 1) * (y1 - y0 + 1) };
    };
    const IL = integral(L);
    const IS = integral(sky);
    const B = new Float64Array(w * h);
    const use = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const b = box(IL, x, y);
        B[y * w + x] = b.sum / b.n;
        const edge = x < 8 || y < 8 || x >= w - 8 || y >= h - 8;
        use[y * w + x] = !edge && box(IS, x, y).sum === 0 ? 1 : 0;
      }
    const std = (f: (i: number) => number): number => {
      let n = 0, m = 0, m2 = 0;
      for (let i = 0; i < w * h; i++) {
        if (!use[i]) continue;
        const v = f(i);
        n++;
        m += v;
        m2 += v * v;
      }
      m /= n;
      return Math.sqrt(Math.max(0, m2 / n - m * m));
    };
    return std((i) => B[i]) / std((i) => L[i] - B[i]);
  });
}

/** 基準 13 の 3 つの景色（paint-shots.mjs の VIEWS と同じ。スタートの場所からの ずれ） */
export const SCORE_VIEWS = [
  { name: 'start', pose: null as null | { dy: number; yaw: number; pitch: number } },
  { name: 'hill', pose: { dy: 0, yaw: 150, pitch: 8 } },
  { name: 'high', pose: { dy: 26, yaw: 20, pitch: -38 } },
] as const;

/** 景色に立つ（スタートの場所そのまま。pose なしは 立ち位置を変えない） */
export async function goView(page: Page, v: (typeof SCORE_VIEWS)[number]): Promise<void> {
  const sp = await page.evaluate(() => (window as any).__rikkun.world.spawn() as { x: number; y: number; z: number });
  if (v.pose === null) {
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.step(1);
      (window as any).__quiet(h);
      h.step(1);
    });
    return;
  }
  await setPoseSettled(page, sp.x, sp.y + v.pose.dy, sp.z, v.pose.yaw, v.pose.pitch);
}

// ---------------------------------------------------------------- hook の有無・置き場・ステージ

/** TEX-A.md の hook のうち、ないもの（空なら全部ある） */
export async function missingHooks(page: Page, names: string[] = ['faceShade', 'flatBlocks', 'texelAt', 'aoAt', 'toScreen', 'pixel', 'blobShadow', 'aoStats', 'setAo']): Promise<string[]> {
  return page.evaluate((names) => {
    const r = (window as any).__rikkun?.render;
    return names.filter((n) => typeof r?.[n] !== 'function').map((n) => 'render.' + n);
  }, names);
}

export interface Arena {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** 床のブロックの y（床の上の面は y + 1） */
  y: number;
}
/**
 * 空に浮かぶ石の床（地形に左右されない）。床の上 20 段は空気。
 * 高さは 地形のいちばん高い所（山 270）より上（VOX-B: 世界の高さ 352。床を 低い所に おくと 山の中の穴になり、空の光が とどかない）。
 */
export const FY = 300;
export const ARENA: Arena = { x0: 24, z0: 24, x1: 48, z1: 48, y: FY };
/** 試験のブロックを置く場所（床の上） */
export const SPOT = { x: 36, y: FY + 1, z: 36 };

export async function buildArena(page: Page, a: Arena = ARENA): Promise<void> {
  await page.evaluate((a) => {
    const h = (window as any).__rikkun;
    (window as any).__FY = a.y; // ページの中の テストの式でも 床の高さを 使えるように
    h.world.fill(a.x0, a.y, a.z0, a.x1, a.y, a.z1, 'stone');
    h.world.fill(a.x0, a.y + 1, a.z0, a.x1, a.y + 20, a.z1, 'air');
  }, a);
  await quiet(page);
}

export async function setBlock(page: Page, x: number, y: number, z: number, id: string): Promise<void> {
  await page.evaluate(({ x, y, z, id }) => (window as any).__rikkun.world.setBlock(x, y, z, id), { x, y, z, id });
}

export interface StageInfo {
  yaw: number;
  cam: { x: number; y: number; z: number };
  /** キャラの体の画面の点 */
  doll: { x: number; y: number };
  player: { x: number; y: number; z: number };
}
/**
 * ブロック (tx, ty, tz) を、プレイヤーから (dx, dz) だけはなれた所から見る。
 * ブロックが画面の中心から off 度はずれて（右）見えるように yaw を決める → キャラの体がブロックにかぶらない。
 * プレイヤーの足もとの高さ py は 省くと ty。
 */
export async function stage(page: Page, t: { x: number; y: number; z: number }, o: { dx: number; dz: number; off?: number; pitch?: number; py?: number; settle?: boolean }): Promise<StageInfo> {
  const px = t.x + 0.5 + o.dx;
  const pz = t.z + 0.5 + o.dz;
  const py = o.py ?? t.y;
  const yawT = (Math.atan2(t.x + 0.5 - px, -(t.z + 0.5 - pz)) * 180) / Math.PI;
  const yaw = yawT - (o.off ?? 35);
  if (o.settle === false) await setPose(page, px, py, pz, yaw, o.pitch ?? -25);
  else await setPoseSettled(page, px, py, pz, yaw, o.pitch ?? -25);
  const r = await page.evaluate(
    ({ px, py, pz }) => {
      const h = (window as any).__rikkun;
      const cam = h.camera.get().position as { x: number; y: number; z: number };
      const d = h.render.toScreen(px, py + 0.9, pz) as { x: number; y: number };
      return { cam, doll: { x: d.x, y: d.y } };
    },
    { px, py, pz },
  );
  return { yaw, cam: r.cam, doll: r.doll, player: { x: px, y: py, z: pz } };
}

export interface Rec {
  scr: { x: number; y: number; onScreen: boolean };
  pixel: Rgb | null;
  /** 3×3 の画素（da, db = −1..1 の 1/16 ずつずらした点）の texelAt の rgb。まんなか = cands[4] */
  cands: Rgb[];
  ao: number;
  /** 面の中で ±0.09 ブロックの 5×5 点ずらした AO（斜めから見たときの 位置のずれを ゆるす用） */
  aoN: number[];
  sky: number;
  block: number;
  darken: number;
}
/**
 * 面の上の点たちを調べる（`grab` のあとで）。点ごとに: 画面の位置・その画素・texelAt（まわり 3×3 の画素も）・aoAt・光。
 * 3×3 は、でこぼこのへこみの底が 斜めから 少しずれて見える分（視差）をゆるす（平らな箱では まんなかだけ見る）。
 */
export async function sampleFace(page: Page, pts: { x: number; y: number; z: number }[], face: Face): Promise<Rec[]> {
  return page.evaluate(
    ({ pts, face }) => {
      const h = (window as any).__rikkun;
      const r = h.render;
      const shot = (window as any).__shot;
      const N: Record<string, number[]> = { top: [0, 1, 0], bottom: [0, -1, 0], north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };
      const AX: Record<string, string[]> = { top: ['x', 'z'], bottom: ['x', 'z'], north: ['x', 'y'], south: ['x', 'y'], east: ['z', 'y'], west: ['z', 'y'] };
      const n = N[face];
      const ax = AX[face];
      const darken = h.world.skyDarkness();
      return pts.map((p: any) => {
        const scr = r.toScreen(p.x, p.y, p.z);
        const ix = Math.floor(scr.x);
        const iy = Math.floor(scr.y);
        let pixel: number[] | null = null;
        if (ix >= 0 && iy >= 0 && ix < shot.w && iy < shot.h) {
          const i = (iy * shot.w + ix) * 4;
          pixel = [shot.data[i], shot.data[i + 1], shot.data[i + 2]];
        }
        const cands: number[][] = [];
        for (let da = -1; da <= 1; da++)
          for (let db = -1; db <= 1; db++) {
            const q: any = { x: p.x, y: p.y, z: p.z };
            q[ax[0]] += da / 16;
            q[ax[1]] += db / 16;
            cands.push(r.texelAt(q.x, q.y, q.z, face).rgb);
          }
        const l = h.world.lightAt(Math.floor(p.x + n[0] * 0.5), Math.floor(p.y + n[1] * 0.5), Math.floor(p.z + n[2] * 0.5));
        const aoN: number[] = [];
        for (const da of [-0.09, -0.045, 0, 0.045, 0.09])
          for (const db of [-0.09, -0.045, 0, 0.045, 0.09]) {
            const q: any = { x: p.x, y: p.y, z: p.z };
            q[ax[0]] += da;
            q[ax[1]] += db;
            aoN.push(r.aoAt(q.x, q.y, q.z, face));
          }
        return { scr, pixel, cands, ao: r.aoAt(p.x, p.y, p.z, face), aoN, sky: l.sky, block: l.block, darken };
      });
    },
    { pts, face },
  ) as Promise<Rec[]>;
}

/** 点が「画面にあって、キャラの体から minDoll 画素以上はなれている」ものだけ */
export function usable(recs: Rec[], doll: { x: number; y: number }, minDoll = 70): Rec[] {
  return recs.filter((r) => r.scr.onScreen && r.pixel !== null && Math.hypot(r.scr.x - doll.x, r.scr.y - doll.y) >= minDoll);
}

/**
 * 点の画素が「タイルの画素 × 面の明るさ × AO × 光」に合うか。
 * tol: 各チャンネルの差の上限。aoSlack: AO の幅（hook の AO ± これ のどれかでよい）。exact: true なら まんなかの画素だけ見る
 */
export function matches(r: Rec, face: Face, o: { tol?: number; aoSlack?: number; exact?: boolean; lightScale?: number } = {}): boolean {
  if (!r.pixel) return false;
  const tol = o.tol ?? 6;
  const light = lightTriple(r.sky, r.darken, r.block).map((v) => v * (o.lightScale ?? 1)) as Rgb;
  const aos = o.aoSlack ? [r.ao - o.aoSlack, r.ao, r.ao + o.aoSlack] : [r.ao];
  const cs = o.exact ? [r.cands[4]] : r.cands;
  return cs.some((c) => aos.some((ao) => near(r.pixel!, expectedRgb(c, FACE_SHADE[face], light, ao), tol)));
}

/** 画素のうち 空の色の数 */
export const countSky = (px: (Rgb | null)[]): number => px.filter((p) => p && isSky(p[0], p[1], p[2])).length;

/** スクリーンショットを test-shots/assets に保存する（TEX_SHOTS=1 のときだけ。レポート用） */
export async function saveShot(page: Page, name: string): Promise<void> {
  if (!process.env.TEX_SHOTS) return;
  await page.screenshot({ path: `test-shots/assets/${name}.png` });
}

/** ブロックの面のタイルに ある色の一覧（texelAt を 16×16 の中心で呼ぶ。重なりはまとめる） */
export async function tilePalette(page: Page, bx: number, by: number, bz: number, face: Face): Promise<Rgb[]> {
  return page.evaluate(
    ({ bx, by, bz, face }) => {
      const r = (window as any).__rikkun.render;
      const seen = new Map<string, number[]>();
      for (let b = 0; b < 16; b++)
        for (let a = 0; a < 16; a++) {
          const ua = (a + 0.5) / 16, ub = (b + 0.5) / 16;
          const p = { top: [bx + ua, by + 1, bz + ub], bottom: [bx + ua, by, bz + ub], north: [bx + ua, by + ub, bz], south: [bx + ua, by + ub, bz + 1], east: [bx + 1, by + ub, bz + ua], west: [bx, by + ub, bz + ua] }[face as string]!;
          const c = r.texelAt(p[0], p[1], p[2], face).rgb as number[];
          seen.set(c.join(','), c);
        }
      return [...seen.values()];
    },
    { bx, by, bz, face },
  ) as Promise<Rgb[]>;
}

/**
 * 画素が「タイルにある どれかの色 × 面の明るさ × 光」に合うか。でこぼこの面は へこみの中に 上向き・横向きの面が 見えるので、
 * shades を 4 つの向きの明るさ（既定）にすると「どの向きの明るさでもよい」、[FACE_SHADE[face]] にすると「その面の明るさ」。
 * 場所と向きの きびしい見方は 平らな箱（基準 4）で行う。
 */
export function matchesPalette(r: Rec, face: Face, pal: Rgb[], o: { tol?: number; anyShade?: boolean } = {}): boolean {
  if (!r.pixel) return false;
  const light = lightTriple(r.sky, r.darken, r.block);
  const shades = o.anyShade ? [1, 0.8, 0.6, 0.5] : [FACE_SHADE[face]];
  return pal.some((c) => shades.some((sh) => near(r.pixel!, expectedRgb(c, sh, light, 1), o.tol ?? 6)));
}

/** AO: 画素の線形の明るさ ÷ (タイルの線形の明るさ × 面の明るさ × 光) が、hook の AO（まわり ±0.09 ブロックのどれか）の ±tol に入る 画素のまわり 3×3 のタイルがあるか */
export function matchesAo(r: Rec, face: Face, tol = 0.04): boolean {
  if (!r.pixel) return false;
  const light = lightTriple(r.sky, r.darken, r.block);
  return r.cands.some((c) => {
    const base = [0, 1, 2].map((i) => lin(c[i]) * FACE_SHADE[face] * light[i]);
    const got = [0, 1, 2].map((i) => lin(r.pixel![i]));
    return r.aoN.some((ao) => [0, 1, 2].every((i) => base[i] < 0.004 || Math.abs(got[i] / base[i] - ao) <= tol));
  });
}

/**
 * 面（4 つの角）の画素の平均。かすみ（scene.fog。線形・白でなく 空の色）を とりのぞいてから 平均する。
 * 点ごとに カメラからの深さ d（カメラの前向きの長さ）で f = clamp((d − near) / (far − near)) を出し、線形の色で (c − f·fog) / (1 − f)。
 * 空（かすみ）に 近すぎる（f > 0.8）点は のぞく。camera の前向きは player の yaw・pitch。
 */
export async function quadMeanUnfogged(page: Page, corners: { x: number; y: number; z: number }[], n = 24): Promise<{ mean: Rgb; used: number; maxFog: number } | null> {
  const fogHex = SCENERY_CONFIG.skyColor;
  const res = await page.evaluate(
    ({ corners, n, near, far }) => {
      const h = (window as any).__rikkun;
      const shot = (window as any).__shot;
      const p = h.player.get();
      const c = h.camera.get().position;
      const yw = (p.yaw * Math.PI) / 180, pt = (p.pitch * Math.PI) / 180;
      const f = [Math.sin(yw) * Math.cos(pt), Math.sin(pt), -Math.cos(yw) * Math.cos(pt)];
      const out: { rgb: number[]; fog: number }[] = [];
      const sc = corners.map((q: any) => h.render.toScreen(q.x, q.y, q.z));
      if (sc.some((q: any) => !q.onScreen)) return null;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n, v = (j + 0.5) / n;
          const w = (k: 'x' | 'y' | 'z') => (1 - v) * ((1 - u) * corners[0][k] + u * corners[1][k]) + v * ((1 - u) * corners[3][k] + u * corners[2][k]);
          const q = { x: w('x'), y: w('y'), z: w('z') };
          const s = h.render.toScreen(q.x, q.y, q.z);
          const ix = Math.floor(s.x), iy = Math.floor(s.y);
          if (ix < 0 || iy < 0 || ix >= shot.w || iy >= shot.h) continue;
          const d = (q.x - c.x) * f[0] + (q.y - c.y) * f[1] + (q.z - c.z) * f[2];
          const k = (iy * shot.w + ix) * 4;
          out.push({ rgb: [shot.data[k], shot.data[k + 1], shot.data[k + 2]], fog: Math.max(0, Math.min(1, (d - near) / (far - near))) });
        }
      return out;
    },
    { corners, n, near: SCENERY_CONFIG.fogNear, far: SCENERY_CONFIG.fogFar },
  );
  if (!res) return null;
  const F = [(fogHex >> 16) & 255, (fogHex >> 8) & 255, fogHex & 255];
  const sum = [0, 0, 0];
  let used = 0, maxFog = 0;
  for (const o of res) {
    if (o.fog > 0.8) continue;
    maxFog = Math.max(maxFog, o.fog);
    for (let i = 0; i < 3; i++) sum[i] += enc((lin(o.rgb[i]) - o.fog * lin(F[i])) / (1 - o.fog));
    used++;
  }
  return { mean: sum.map((v) => v / Math.max(1, used)) as Rgb, used, maxFog };
}
