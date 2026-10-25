// E2E の 結果から、spec ファイルごとの 時間（秒。テストの 時間の 合計）を 表に 書く。
// 使い方: node scripts/e2e-shard-times.mjs [--out <書く ファイル>] <結果 1> <結果 2> ...
//   結果は CI の ジョブの ログ（list レポーター）か、Playwright の JSON レポート（*.json）。全部の シャードの 分を わたす。
//   --out を 付けなければ e2e/shard-times.json を 書きなおす。
// CI は 毎回 シャードごとの JSON を 作って 置き、次の CI が それを 使う（scripts/e2e-shard.mjs の E2E_TIMES_DIR。#311）。
import { readFileSync, writeFileSync } from 'node:fs';

const LINE = /[✓✘-]\s+\d+ \[chromium\] › (e2e\/[^:]+):\d+:\d+ › .* \(([\d.]+)(ms|s|m)\)\s*$/;
const UNIT = { ms: 0.001, s: 1, m: 60 };

/** list レポーターの ログ → { spec: 秒 } に 足す */
export function addFromLog(text, sec = {}) {
  for (const line of text.split('\n')) {
    const m = LINE.exec(line);
    if (!m) continue;
    sec[m[1]] = (sec[m[1]] ?? 0) + Number(m[2]) * UNIT[m[3]];
  }
  return sec;
}

/** Playwright の JSON レポート → { spec: 秒 } に 足す（file は testDir から の 相対 パスなので e2e/ を 付ける） */
export function addFromJson(report, sec = {}) {
  const walk = (suite, file) => {
    const f = suite.file ?? file;
    for (const spec of suite.specs ?? []) {
      const key = `e2e/${spec.file ?? f}`;
      for (const t of spec.tests ?? []) for (const r of t.results ?? []) sec[key] = (sec[key] ?? 0) + (r.duration ?? 0) / 1000;
    }
    for (const s of suite.suites ?? []) walk(s, f);
  };
  for (const s of report.suites ?? []) walk(s, s.file);
  return sec;
}

/** { spec: 秒 } → 名前順・整数の 秒 */
export function tidy(sec) {
  return Object.fromEntries(Object.entries(sec).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, Math.round(v)]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let out = 'e2e/shard-times.json';
  const oi = args.indexOf('--out');
  if (oi >= 0) {
    out = args[oi + 1];
    args.splice(oi, 2);
  }
  if (args.length === 0 || !out) {
    console.error('使い方: node scripts/e2e-shard-times.mjs [--out <ファイル>] <ログ か JSON>...');
    process.exit(1);
  }
  const sec = {};
  for (const f of args) {
    const text = readFileSync(f, 'utf8');
    if (f.endsWith('.json')) addFromJson(JSON.parse(text), sec);
    else addFromLog(text, sec);
  }
  const sorted = tidy(sec);
  writeFileSync(out, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`${out}: ${Object.keys(sorted).length} ファイル、合計 ${Math.round(Object.values(sorted).reduce((a, b) => a + b, 0) / 60)} 分`);
}
