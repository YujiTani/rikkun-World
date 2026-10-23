// WEAPON-9 §5.7.2: 虹の 手持ちの 絵（女の子）を 切りつめて 棚づめする。
//   使い方: node scripts/pack-niji-held.mjs   （art/WEAPON-9/held/niji/*.png -> public/models/char/girl/niji/）
// 刀の組 6 まいの 代わりに 読む（たしかめ: 足し算ではなく 入れかえ。絵の 合計は 変わらない）。
// 色: 色見本 22 色 ＋ 虹の ための 9 色（palette_extra.json の niji）。atlas.json に extras と packed を 書く。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, packMotion } from './pack-char-atlas.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const girl = JSON.parse(readFileSync(resolve(root, 'public/models/char/girl/atlas.json'), 'utf8'));
// 使い方: node scripts/pack-niji-held.mjs [niji|raijin|fujin]（なしなら niji）
const skin = process.argv[2] ?? 'niji';
const extra = JSON.parse(readFileSync(resolve(root, 'art/WEAPON-9/held/palette_extra.json'), 'utf8'))[skin];
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const ORDER = skin === 'niji' ? ['dark', 'green', 'blue', 'purple', 'magenta', 'gold', 'goldd', 'goldl', 'red'] : Object.keys(extra);
const extras = [];
for (const k of ORDER) {
  const c = hex(extra[k]);
  if (!extras.some((e) => e[0] === c[0] && e[1] === c[1] && e[2] === c[2])) extras.push(c); // おなじ 色は 1 席
}
const outDir = resolve(root, `public/models/char/girl/${skin}`);
mkdirSync(outDir, { recursive: true });
const motions = {};
let gpu = 0;
for (const name of ['katana_thrust', 'katana_walk_chudan', 'katana_kesa', 'katana_walk_jodan', 'katana_kiriage', 'katana_walk_gedan']) {
  const frames = girl.motions[name].frames;
  const { png, packed } = packMotion(decodePng(readFileSync(resolve(root, `art/WEAPON-9/held/${skin}/${name}.png`))), frames);
  writeFileSync(resolve(outDir, `${name}.png`), encodePng(png));
  motions[name] = { frames, packed };
  const base = girl.motions[name].packed;
  gpu += png.width * png.height - base.width * base.height;
  console.log(name, `${png.width}x${png.height}`, `(通常 ${base.width}x${base.height})`);
}
writeFileSync(resolve(outDir, 'atlas.json'), JSON.stringify({ extras, motions }) + '\n');
console.log('GPU の ちがい(虹 − 通常):', gpu, 'B');
