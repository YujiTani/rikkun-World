// アイテム id と ようかい kind の一覧を ソースから 読みとって 返す（eslint.config.js が 使う）。
// items.ts の `id: '...'` と PLACEABLE の ならび、contracts.ts の YokaiKind を 正規表現で 拾う。
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

export function contentIds() {
  const items = read('src/inventory/items.ts');
  const ids = new Set();
  for (const m of items.matchAll(/\bid: '([a-z0-9_]+)'/g)) ids.add(m[1]);
  const placeable = items.match(/const PLACEABLE[^=]*=\s*\[([^\]]*)\]/);
  if (placeable) for (const m of placeable[1].matchAll(/'([a-z0-9_]+)'/g)) ids.add(m[1]);
  const kind = read('src/contracts.ts').match(/export type YokaiKind =([^;]+);/);
  if (kind) for (const m of kind[1].matchAll(/'([a-z0-9_]+)'/g)) ids.add(m[1]);
  return [...ids].sort();
}

if (process.argv[1] === new URL(import.meta.url).pathname) console.log(contentIds().join('\n'));
