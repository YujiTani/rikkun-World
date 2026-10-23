// E2E を 時間で シャードに 分ける。Playwright の --shard は テストの「数」で 分けるので、重い spec が 1 つの シャードに 集まる。
// e2e/shard-times.json（前の CI の spec ごとの 時間）を 使い、重い順に いちばん すいている シャードへ 入れる。
// 使い方: npx playwright test $(node scripts/e2e-shard.mjs 2 4)  → 4 つに 分けた 2 つ目の spec の 一覧
// 表に ない spec（新しい spec）は 表の まん中の 時間と みなす。
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

/** files を times（秒）で n こに 分ける。戻りは シャードごとの ファイルの 一覧（1 つ目が index 0） */
export function splitByTime(files, times, n) {
  const known = files.map((f) => times[f]).filter((t) => typeof t === 'number').sort((a, b) => a - b);
  const median = known.length ? known[Math.floor(known.length / 2)] : 60;
  const items = files.map((f) => ({ f, t: typeof times[f] === 'number' ? times[f] : median }));
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const k = Number(process.argv[2]);
  const n = Number(process.argv[3]);
  if (!(n >= 1 && k >= 1 && k <= n)) {
    console.error('使い方: node scripts/e2e-shard.mjs <何こ目> <いくつに 分けるか>');
    process.exit(1);
  }
  const times = existsSync('e2e/shard-times.json') ? JSON.parse(readFileSync('e2e/shard-times.json', 'utf8')) : {};
  console.log(splitByTime(specFiles(), times, n)[k - 1].join(' '));
}
