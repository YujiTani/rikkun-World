// CI の E2E のログ（list レポーター）から、spec ファイルごとの時間（秒。テストの時間の合計）を e2e/shard-times.json に書く。
// 使い方: node scripts/e2e-shard-times.mjs <ジョブのログ 1> <ログ 2> ...（4 つの シャードの ログを 全部 わたす）
// 時間で シャードを 分ける（scripts/e2e-shard.mjs）ための 表。spec が ふえたり 重さが 変わったら ときどき 作りなおす。
import { readFileSync, writeFileSync } from 'node:fs';

const LINE = /[✓✘-]\s+\d+ \[chromium\] › (e2e\/[^:]+):\d+:\d+ › .* \(([\d.]+)(ms|s|m)\)\s*$/;
const UNIT = { ms: 0.001, s: 1, m: 60 };

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('使い方: node scripts/e2e-shard-times.mjs <ログ>...');
  process.exit(1);
}
const sec = {};
for (const f of files) {
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = LINE.exec(line);
    if (!m) continue;
    sec[m[1]] = (sec[m[1]] ?? 0) + Number(m[2]) * UNIT[m[3]];
  }
}
const sorted = Object.fromEntries(Object.entries(sec).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, Math.round(v)]));
writeFileSync('e2e/shard-times.json', JSON.stringify(sorted, null, 2) + '\n');
console.log(`${Object.keys(sorted).length} ファイル、合計 ${Math.round(Object.values(sorted).reduce((a, b) => a + b, 0) / 60)} 分`);
