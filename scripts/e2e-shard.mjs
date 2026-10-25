// E2E を 時間で シャードに 分ける。Playwright の --shard は テストの「数」で 分けるので、重い spec が 1 つの シャードに 集まる。
// e2e/shard-times.json（前の CI の spec ごとの 時間）を 使い、重い順に いちばん すいている シャードへ 入れる。
// 使い方: npx playwright test $(node scripts/e2e-shard.mjs 2 5)  → 5 つに 分けた 2 つ目の spec の 一覧
// 環境変数 E2E_TIMES_DIR に フォルダが あれば、中の *.json（いちばん 新しい main の CI の 時間。CI が 自動で 置く）を
// 表の 上に かさねて 使う。表に ない spec（新しい spec）は「テストの 本数 × 1 本あたりの まん中の 時間」と みなす（#311）。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function specFiles(dir = 'e2e') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...specFiles(p));
    else if (e.name.endsWith('.spec.ts')) out.push(p.split('\\').join('/'));
  }
  return out.sort();
}

/** spec の 中の test( の 本数（describe は 数えない。新しい spec の 時間の 見つもりに 使う） */
export function countTests(src) {
  return (src.match(/(^|[^.\w])test(\.(only|fixme|skip|fail))?\(\s*['"`]/gm) ?? []).length;
}

/** files を times（秒）で n こに 分ける。戻りは シャードごとの ファイルの 一覧（1 つ目が index 0）。
 *  counts（spec ごとの テストの 本数）が あれば、表に ない spec は 本数 × 1 本あたりの まん中の 時間、なければ 表の まん中の 時間 */
export function splitByTime(files, times, n, counts) {
  const has = (f) => typeof times[f] === 'number';
  const sorted = (xs) => xs.sort((a, b) => a - b);
  const known = sorted(files.filter(has).map((f) => times[f]));
  const median = known.length ? known[Math.floor(known.length / 2)] : 60;
  const perTest = counts ? sorted(files.filter((f) => has(f) && counts[f] > 0).map((f) => times[f] / counts[f])) : [];
  const perTestMedian = perTest.length ? perTest[Math.floor(perTest.length / 2)] : 0;
  const guess = (f) => (perTestMedian > 0 && counts?.[f] > 0 ? counts[f] * perTestMedian : median);
  const items = files.map((f) => ({ f, t: has(f) ? times[f] : guess(f) }));
  // 重い順（同じ 時間なら 名前順。どの ジョブで 回しても 同じ 分け方に なる）
  items.sort((a, b) => b.t - a.t || a.f.localeCompare(b.f));
  const bins = Array.from({ length: n }, () => ({ total: 0, files: [] }));
  for (const it of items) {
    let best = bins[0];
    for (const b of bins) if (b.total < best.total) best = b;
    best.files.push(it.f);
    best.total += it.t;
  }
  return bins.map((b) => b.files.sort());
}

/** 表（e2e/shard-times.json）に、dir の 中の *.json（新しい 時間）を かさねる。同じ spec は 新しい ほうを 使う */
export function loadTimes(table = 'e2e/shard-times.json', dir = process.env.E2E_TIMES_DIR) {
  const times = existsSync(table) ? JSON.parse(readFileSync(table, 'utf8')) : {};
  if (dir && existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith('.json')) continue;
      try {
        Object.assign(times, JSON.parse(readFileSync(join(dir, name), 'utf8')));
      } catch {
        // こわれた ファイルは 使わない（表だけで 分ける）
      }
    }
  }
  return times;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const k = Number(process.argv[2]);
  const n = Number(process.argv[3]);
  if (!(n >= 1 && k >= 1 && k <= n)) {
    console.error('使い方: node scripts/e2e-shard.mjs <何こ目> <いくつに 分けるか>');
    process.exit(1);
  }
  const files = specFiles();
  const counts = Object.fromEntries(files.map((f) => [f, countTests(readFileSync(f, 'utf8'))]));
  console.log(splitByTime(files, loadTimes(), n, counts)[k - 1].join(' '));
}
