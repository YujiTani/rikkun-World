import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { measure } from './titleSoundMeasure.testutil';

/**
 * AC20 (1)(2)(5)（BALANCE.md §5・§7）: 加工した音ファイル 3 つ。
 *  (1) ゲームが読める所（public/sound/nick/）にあり、元の素材ファイルは リポジトリに無い
 *  (2) ピーク −1 dBFS 以下・立ち上がり（鳴り始め → 最大の 9 割）0.05 秒以上（ファイルを読んで数える）
 *  (5) 試聴ページ public/sound/nick/listen.html があり 3 つを指している（鳴るかは オーナー確認）
 * 長さの上限は 書かない。重ねない時間は「聞こえる長さ（−20 dB まで）」3.0・3.8・5.2 秒。
 * 数える道具は ffmpeg（なければ (2) だけ とばす。CI の入れ物に ffmpeg がなければ、そのままでは通らない: 台帳へ）。
 */
const ROOT = resolve(__dirname, '../..');
const DIR = join(ROOT, 'public/sound/nick');
const TIERS = ['oyabun', 'taisho', 'nushi'] as const;
const HEARABLE = { oyabun: 3.0, taisho: 3.8, nushi: 5.2 } as const;
const files = TIERS.map((t) => join(DIR, `appear_${t}.mp3`));

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.git' || n === 'dist' || n === 'test-results' || n === 'playwright-report') continue;
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe('AC20 (1) 音ファイル', () => {
  it('3 つとも public/sound/nick/ にあり、mp3（先頭が ID3 か フレーム同期）で 130KB 以下・3 つで 400KB 以下', () => {
    let total = 0;
    for (const f of files) {
      expect(existsSync(f), f).toBe(true);
      const b = readFileSync(f);
      const ok = b.subarray(0, 3).toString() === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0);
      expect(ok, `${f} が mp3 ではない`).toBe(true);
      expect(b.length).toBeLessThanOrEqual(130 * 1024);
      total += b.length;
    }
    expect(total).toBeLessThanOrEqual(400 * 1024);
  });

  it('元の素材ファイル（太鼓・心臓・鐘の 1 打。samples/*.mp3）は リポジトリに無い。音は nick の 3 つだけ', () => {
    const all = walk(ROOT).map((p) => p.slice(ROOT.length + 1));
    expect(all.filter((p) => /(^|\/)samples\//.test(p) && /\.(mp3|wav|ogg|flac|m4a)$/i.test(p))).toEqual([]);
    const audio = all.filter((p) => /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(p));
    expect(audio.sort()).toEqual(TIERS.map((t) => `public/sound/nick/appear_${t}.mp3`).sort());
  });

  it('出どころの説明ファイルがある（効果音ラボ・再配布不可）', () => {
    const cands = [join(DIR, 'README.md'), join(ROOT, 'docs/audio/CREDITS.md')].filter(existsSync);
    expect(cands.length).toBeGreaterThan(0);
    const txt = cands.map((c) => readFileSync(c, 'utf8')).join('\n');
    expect(txt).toContain('効果音ラボ');
    expect(txt).toContain('soundeffect-lab.info');
  });
});

describe('AC20 (5) 試聴ページ', () => {
  it('public/sound/nick/listen.html が 3 つの音を指している', () => {
    const p = join(DIR, 'listen.html');
    expect(existsSync(p)).toBe(true);
    const html = readFileSync(p, 'utf8');
    for (const t of TIERS) expect(html).toContain(`appear_${t}.mp3`);
  });
});

describe.skipIf(!hasFfmpeg)('AC20 (2) 安全のきまり（ファイルを読んで数える）', () => {
  for (const [i, t] of TIERS.entries()) {
    it(`${t}: ピーク −1 dBFS 以下・立ち上がり 0.05 秒以上・聞こえる長さ ${HEARABLE[t]} 秒（±0.15）`, () => {
      expect(existsSync(files[i]!)).toBe(true);
      const m = measure(files[i]!);
      expect(m.peakDb).toBeLessThanOrEqual(-1);
      expect(m.attack).toBeGreaterThanOrEqual(0.05);
      // 聞こえる長さ（鳴り始めから、いちばん大きい所の −20 dB まで）。v4 の meta と同じ数（音そのものを変えていない目印）
      expect(Math.abs(m.hearableFromStart - HEARABLE[t])).toBeLessThanOrEqual(0.15);
    });
  }
});
