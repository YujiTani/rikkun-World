// アイテム id と ようかい kind の一覧を ソースから 読みとって 返す（eslint.config.js が 使う）。
// content/items/ の id（ids.ts と 各シリーズの 定義の キー）、content/yokai/ids.ts の 妖怪の 種類を 正規表現で 拾う。
import { readdirSync, readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

export function contentIds() {
  const ids = new Set();
  // 登録表（#306）: content/items/ids.ts の 引用符つきの 文字は ぜんぶ id（シリーズごとの 配列）
  for (const m of read('src/content/items/ids.ts').matchAll(/'([a-z0-9_]+)'/g)) ids.add(m[1]);
  // 登録表（#306）: content/items/*.ts の どのファイルでも、定義の 先頭の 行（2 マス下げた `id: {`）の キーは id（ファイルの 置き場所に 頼らない）
  for (const f of readdirSync(new URL('../src/content/items/', import.meta.url))) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
    for (const m of read(`src/content/items/${f}`).matchAll(/^ {2}([a-z][a-z0-9_]*): \{/gm)) ids.add(m[1]);
  }
  // 登録表（#307）: 妖怪の 種類は content/yokai/ids.ts の 引用符つきの 文字（contracts.ts の YokaiKind は そこからの 別名）
  for (const m of read('src/content/yokai/ids.ts').matchAll(/'([a-z0-9_]+)'/g)) ids.add(m[1]);
  return [...ids].sort();
}

if (process.argv[1] === new URL(import.meta.url).pathname) console.log(contentIds().join('\n'));
