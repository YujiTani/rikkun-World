import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FFMPEG, measure } from './titleSoundMeasure.testutil';

/**
 * MINE-1F F16 ①②〔docs/design/MINE-1F.md §3.4・§6.2・docs/audio/MINE-1F.md〕: 音ファイル 4 つ。
 *  ① `public/sound/yakata/` に 4 つ〔ふんいき・挑戦の 曲・ずずん・ひらく〕と 出どころ・規約の README・試聴ページ `listen.html`。そこの 音ファイルは この 4 つ だけ。元の 素材〔太鼓・鐘の 1 打〕は リポジトリに ない。
 *  ② 4 つとも ピーク −1 dBFS 以下・立ち上がり 0.05 秒 以上〔ファイルを 読んで はかる。二つ名の AC20 (2) と 同じ はかり方〕。
 *     ずずん・ひらくの 聞こえる 長さ〔鳴りはじめ → いちばん 大きい 所の −20 dB〕が `docs/audio/MINE-1F.md` の 数 ±0.15 秒〔音を かえて いない 目じるし〕。ループの 2 つは 2 秒 以上。
 * 【数の 出どころ】聞こえる 長さの 1.6・1.0 は `docs/audio/MINE-1F.md` の 表の「約」の 数〔ogg に した あと はかりなおして 書きかえる ときは ここも〕。
 * 場面の 時間・和音は e2e/mine1f.spec.ts〔`audio.state()`。時間は `yakataSoundTable()` から 読む〕。数える道具は ffmpeg〔CI では 無いと 失敗〕。
 */
const ROOT = resolve(__dirname, '../..');
const DIR = join(ROOT, 'public/sound/yakata');
const NAMES = ['ambience', 'challenge', 'gate_close', 'gate_open'] as const;
const HEARABLE: Partial<Record<(typeof NAMES)[number], number>> = { gate_close: 1.6, gate_open: 1.0 };
const LOOPS = ['ambience', 'challenge'] as const;
const files = NAMES.map((n) => join(DIR, `${n}.ogg`));
const hasFfmpeg = spawnSync(FFMPEG, ['-version']).status === 0;

describe('F16 ① 音ファイル・README・試聴ページ', () => {
  it('4 つとも public/sound/yakata/ に あり ogg〔先頭 OggS〕', () => {
    for (const f of files) {
      expect(existsSync(f), f).toBe(true);
      expect(readFileSync(f).subarray(0, 4).toString(), `${f} が ogg では ない`).toBe('OggS');
    }
  });

  it('音ファイルは この 4 つ だけ・元の 素材〔samples/〕は リポジトリに ない', () => {
    const all = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(all.filter((p) => /(^|\/)samples\//.test(p) && /\.(mp3|wav|ogg|flac|m4a)$/i.test(p))).toEqual([]);
    const audio = (existsSync(DIR) ? readdirSync(DIR) : []).filter((p) => /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(p));
    expect(audio.sort()).toEqual(NAMES.map((n) => `${n}.ogg`).sort());
  });

  it('README に 出どころ・規約〔効果音ラボ・再配布不可〕', () => {
    const p = join(DIR, 'README.md');
    expect(existsSync(p), 'README').toBe(true);
    const txt = readFileSync(p, 'utf8');
    expect(txt).toContain('効果音ラボ');
    expect(txt).toContain('soundeffect-lab.info');
    expect(txt).toContain('再配布');
  });

  it('listen.html が 4 つの 音を さしている', () => {
    const p = join(DIR, 'listen.html');
    expect(existsSync(p), 'listen.html').toBe(true);
    const html = readFileSync(p, 'utf8');
    for (const n of NAMES) expect(html).toContain(`${n}.ogg`);
  });
});

if (process.env.CI) {
  it('CI に ffmpeg が ある', () => {
    expect(hasFfmpeg).toBe(true);
  });
}

describe.skipIf(!hasFfmpeg && !process.env.CI)('F16 ② 安全〔ファイルを 読んで はかる〕', () => {
  for (const [i, n] of NAMES.entries()) {
    it(`${n}: ピーク −1 dBFS 以下・立ち上がり 0.05 秒 以上${HEARABLE[n] ? `・聞こえる 長さ ${HEARABLE[n]} 秒〔±0.15〕` : '・ループは 2 秒 以上'}`, () => {
      expect(existsSync(files[i]!), `${n}.ogg が ない`).toBe(true);
      const m = measure(files[i]!);
      expect(m.peakDb).toBeLessThanOrEqual(-1);
      expect(m.attack).toBeGreaterThanOrEqual(0.05);
      const h = HEARABLE[n];
      if (h !== undefined) expect(Math.abs(m.hearableFromStart - h)).toBeLessThanOrEqual(0.15);
      if ((LOOPS as readonly string[]).includes(n)) expect(m.length).toBeGreaterThanOrEqual(2);
    });
  }
});
