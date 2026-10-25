// ラチェット（#310）: コードのきまり違反の「数」を 数えて、ratchet.json の 上限より ふえたら 失敗する。
// 使い方: node scripts/ratchet.mjs          … 数えて 上限と くらべる（ふえていたら exit 1）
//         node scripts/ratchet.mjs --update … 上限を 今の数まで 下げる（上げることは しない）
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const LIMIT_FILE = new URL('../ratchet.json', import.meta.url);
const ROOT = new URL('..', import.meta.url).pathname;
const BIN = (name) => `${ROOT}node_modules/.bin/${name}`;

/** コマンドを 動かして stdout を 返す（終了コードは 見ない。eslint / knip は 違反が あると 1 を 返すため） */
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT });
    const out = [];
    const err = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', () => resolve({ out: Buffer.concat(out).toString(), err: Buffer.concat(err).toString() }));
  });
}

const parse = (name, { out, err }) => {
  try {
    return JSON.parse(out);
  } catch {
    throw new Error(`${name} の 結果が 読めません:\n${(err || out).slice(0, 800)}`);
  }
};

async function countEslint() {
  const files = parse('eslint', await run(BIN('eslint'), ['src', '-f', 'json']));
  const c = { idCompare: 0, idCase: 0, switchExhaustive: 0 };
  for (const f of files) {
    for (const m of f.messages) {
      if (m.fatal) throw new Error(`eslint が 失敗: ${f.filePath} ${m.message}`);
      if (m.ruleId === '@typescript-eslint/switch-exhaustiveness-check') c.switchExhaustive++;
      else if (m.ruleId === 'no-restricted-syntax' && m.message.startsWith('[id-compare]')) c.idCompare++;
      else if (m.ruleId === 'no-restricted-syntax' && m.message.startsWith('[id-case]')) c.idCase++;
    }
  }
  return c;
}

async function countMadge() {
  // 設定は .madgerc（type-only import は 数えない）
  const cycles = parse('madge', await run(BIN('madge'), ['--circular', '--json', 'src']));
  return { cycles: cycles.length };
}

async function countKnip() {
  const { issues } = parse('knip', await run(BIN('knip'), ['--reporter', 'json']));
  let unusedExports = 0;
  let unusedTypes = 0;
  for (const i of issues) {
    unusedExports += (i.exports ?? []).length;
    unusedTypes += (i.types ?? []).length;
  }
  return { unusedExports, unusedTypes };
}

/** src の .ts（テストは 別。.test.ts / .d.ts を のぞく）を 1 つずつ 調べる */
function walkSrc(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}${e.name}`;
    if (e.isDirectory()) walkSrc(`${p}/`, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** eslint-disable の ある 行の数（src 全部。テストも ふくむ）と、800 行を こえる ファイルの数（src の .ts。テストは のぞく） */
function countFiles() {
  let eslintDisable = 0;
  let filesOver800 = 0;
  for (const f of walkSrc(`${ROOT}src/`)) {
    const text = readFileSync(f, 'utf8');
    eslintDisable += text.split('\n').filter((l) => l.includes('eslint-disable')).length;
    if (!f.endsWith('.test.ts') && text.split('\n').length - 1 > 800) filesOver800++;
  }
  return { eslintDisable, filesOver800 };
}

const LABELS = {
  idCompare: 'id の === / !== 直書き',
  idCase: 'id の case 直書き',
  switchExhaustive: 'switch の取りこぼし',
  cycles: 'import の ぐるぐる（循環）',
  unusedExports: '使われない export',
  unusedTypes: '使われない type の export',
  eslintDisable: 'eslint-disable の 行',
  filesOver800: '800 行を こえる .ts ファイル（テストは のぞく）',
};

const t0 = Date.now();
const results = [...(await Promise.all([countEslint(), countMadge(), countKnip()])), countFiles()];
const counts = Object.assign({}, ...results);
const update = process.argv.includes('--update');
const limits = existsSync(LIMIT_FILE) ? JSON.parse(readFileSync(LIMIT_FILE, 'utf8')) : {};

let failed = false;
console.log('きまり: 今 / 上限');
for (const key of Object.keys(LABELS)) {
  const now = counts[key];
  const limit = limits[key] ?? now; // 上限が まだ 無ければ 今の数（--update で 記録）
  const mark = now > limit ? '  NG（ふえた）' : now < limit ? '  ↓ 下げられる' : '';
  if (now > limit) failed = true;
  console.log(`${LABELS[key]}: ${now} / ${limit}${mark}`);
}

if (update) {
  const next = {};
  for (const key of Object.keys(LABELS)) next[key] = Math.min(limits[key] ?? Infinity, counts[key]);
  writeFileSync(LIMIT_FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log('ratchet.json を 更新しました（上限は 下がる方向にだけ 動きます）');
}
console.log(`（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
if (failed) {
  console.log('ふえています。ふやさずに なおすか、理由を 書いて 相談してください。');
  process.exit(1);
}
