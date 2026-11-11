// ユニットテストの 結果（vitest の JSON レポーター）から、ファイルごとの 時間（秒）を 表に 書く。
// 使い方: npx vitest run --reporter=json --outputFile=out.json && node scripts/unit-shard-times.mjs out.json [--out <書く ファイル>]
//   --out を 付けなければ scripts/unit-shard-times.json を 書きなおす。CI を 2 つに 分ける 表（scripts/vitestTimeSequencer.ts。#447）。
// 時間は endTime - startTime（beforeAll も 含む）。
import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';

export function timesFromReport(report, root = process.cwd()) {
  const sec = {};
  for (const t of report.testResults ?? []) {
    const key = relative(root, t.name).split('\\').join('/');
    sec[key] = Math.max(1, Math.round((t.endTime - t.startTime) / 1000));
  }
  return Object.fromEntries(Object.entries(sec).sort(([a], [b]) => a.localeCompare(b)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let out = new URL('./unit-shard-times.json', import.meta.url).pathname;
  const oi = args.indexOf('--out');
  if (oi >= 0) {
    out = args[oi + 1];
    args.splice(oi, 2);
  }
  if (args.length === 0 || !out) {
    console.error('使い方: node scripts/unit-shard-times.mjs <vitest の JSON> [--out <ファイル>]');
    process.exit(1);
  }
  const sec = timesFromReport(JSON.parse(readFileSync(args[0], 'utf8')));
  writeFileSync(out, JSON.stringify(sec, null, 2) + '\n');
  console.log(`${out}: ${Object.keys(sec).length} ファイル、合計 ${Math.round(Object.values(sec).reduce((a, b) => a + b, 0) / 60)} 分`);
}
