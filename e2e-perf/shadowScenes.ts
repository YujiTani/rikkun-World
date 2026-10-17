import { expect, test, type Page } from '@playwright/test';

/**
 * #144 影の試作: スクショ（shadowShots）と計測（shadowBench）で 同じ場面を使う。
 * 場面: start（スタート・昼）/ chara（キャラのまわり）/ sky（上空）/ dusk（ゆうがた）/ night（夜のたいまつ）/ cave（洞くつ）
 */
/** シェーダーの まちがい（コンパイルできない など）を 見のがさない */
export const errors: string[] = [];
test.afterEach(() => {
  expect(errors, errors.join('\n')).toEqual([]);
  errors.length = 0;
});

export async function open(page: Page, query: string): Promise<void> {
  if (!(page as any).__shErr) {
    (page as any).__shErr = true;
    page.on('console', (m) => {
      if (m.type() === 'error' && /shader|WebGL|GL_|program/i.test(m.text())) errors.push(m.text().slice(0, 300));
    });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?nosave=1' + query);
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true, null, { timeout: 120_000 });
  await page.evaluate(() => (window as any).__rikkun.achievements?.mute?.(true));
  // キャラの絵（非同期で読む）を待つ
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.yokai.clear();
  });
}

/** 光とメッシュが落ちつくまで進める */
export const QUIET = `(h) => { let n = 0; while ((h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 4000) { h.step(5); n += 5; } h.step(2); }`;

/** 場面をつくる（world を変える場面は 最後にまとめる） */
export async function scene(page: Page, name: string): Promise<void> {
  await page.evaluate(
    ([name, quiet]) => {
      const h = (window as any).__rikkun;
      const q = eval(quiet as string);
      const sp = h.world.spawn();
      const gh = (x: number, z: number) => h.world.groundHeight(Math.floor(x), Math.floor(z));
      h.yokai.clear();
      const put = (x: number, y: number, z: number, yaw: number, pitch: number) =>
        h.player.set({ position: { x, y, z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch });
      /** たいらな くさはら（17×17）を作って 地面の高さを返す */
      const flat = (x0: number, z0: number): number => {
        const gy = gh(x0 + 8, z0 + 8);
        h.world.fill(x0, gy + 1, z0, x0 + 16, gy + 16, z0 + 16, 'air');
        h.world.fill(x0, gy - 2, z0, x0 + 16, gy - 1, z0 + 16, 'dirt');
        h.world.fill(x0, gy, z0, x0 + 16, gy, z0 + 16, 'grass');
        return gy;
      };
      if (name === 'start') {
        h.time.set(14000);
        put(sp.x, sp.y, sp.z, 0, -12);
      } else if (name === 'chara') {
        // 朝の 2 分半（太陽は 東の 26°）。たいらな くさはらで 北（-z）を見る: 影は 左（西）へ 長く のびる
        h.time.set(9000);
        const gy = flat(Math.floor(sp.x) - 26, Math.floor(sp.z) - 22);
        q(h);
        const x0 = Math.floor(sp.x) - 26;
        const z0 = Math.floor(sp.z) - 22;
        put(x0 + 9.5, gy + 1, z0 + 11.5, 0, -30);
        h.yokai.spawn('karakasa', x0 + 11.5, gy + 1, z0 + 7.5);
      } else if (name === 'sky') {
        h.time.set(14000);
        put(sp.x, sp.y + 26, sp.z, 0, -70);
      } else if (name === 'dusk') {
        h.time.set(55600);
        put(sp.x, sp.y, sp.z, 15, -16);
        h.yokai.spawn('chochin', sp.x - 3, gh(sp.x - 3, sp.z - 3) + 1, sp.z - 3);
      } else if (name === 'night') {
        h.time.set(70000);
        // たいらな くさはら（17×17）に たいまつ 1 本。キャラは たいまつの 右: 影は 右へ。妖怪は 左おく: 影は おくへ
        const x0 = Math.floor(sp.x) - 26;
        const z0 = Math.floor(sp.z) + 4;
        const gy = flat(x0, z0);
        h.world.setBlock(x0 + 6, gy + 1, z0 + 8, 'torch');
        q(h);
        put(x0 + 8.4, gy + 1, z0 + 8.6, 0, -30);
        h.yokai.spawn('karakasa', x0 + 5.5, gy + 1, z0 + 5);
      } else if (name === 'cave') {
        h.time.set(14000);
        const x0 = Math.floor(sp.x) + 6;
        const z0 = Math.floor(sp.z) + 6;
        let top = 0;
        for (let z = z0 - 1; z <= z0 + 11; z++) for (let x = x0 - 1; x <= x0 + 11; x++) top = Math.max(top, gh(x, z));
        // 石のかたまりの中に へや（9×4×9）と、空へぬける たての穴（2×2）
        h.world.fill(x0 - 1, 2, z0 - 1, x0 + 11, top, z0 + 11, 'stone');
        h.world.fill(x0, 3, z0, x0 + 8, 6, z0 + 8, 'air');
        h.world.fill(x0 + 7, 3, z0 + 3, x0 + 8, top, z0 + 4, 'air');
        h.world.setBlock(x0 + 1, 3, z0 + 1, 'torch');
        h.world.setBlock(x0 + 1, 3, z0 + 7, 'torch');
        q(h);
        // たいまつ 2 本の あいだ（+z を見る）: 影が 2 本 できる
        put(x0 + 4, 3, z0 + 4.5, 180, -22);
        h.yokai.spawn('chochin', x0 + 5.5, 3, z0 + 6.5);
      }
      h.step(3);
      q(h);
    },
    [name, QUIET],
  );
}

export const SCENES = process.env.SHSCENES ? process.env.SHSCENES.split(',') : ['start', 'chara', 'sky', 'dusk', 'night', 'cave'];

