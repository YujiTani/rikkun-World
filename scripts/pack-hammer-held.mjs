// LEGEND-4 大地のハンマー: 振り（hammer_swing 20 コマ）とかまえ歩き（8 コマ）の 絵を 切りつめて 棚づめする。
//   使い方: node scripts/pack-hammer-held.mjs   （art/LEGEND-4/motion/hammer/*.png -> public/models/char/girl/hammer/）
// ゲームの 手に 持つ 絵の 差しかえ（skin = 'hammer'）。刀の組の うち 'katana_kesa'（= ハンマーの 振り）と 'katana_walk_jodan'（= かついで 歩く）だけ 入れかえる。
// ほかの 4 まいは ハンマーでは 使わない ので 入れない（`partial`。足りない 絵は ふつうの 絵を 読む）。色: 色見本 ＋ ハンマーの 9 色（atlas.json の extras.hammer）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, packMotion } from './pack-char-atlas.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'art/LEGEND-4/motion');
const atlas = JSON.parse(readFileSync(resolve(src, 'atlas.json'), 'utf8'));
const extras = atlas.extras.hammer;
const outDir = resolve(root, 'public/models/char/girl/hammer');
mkdirSync(outDir, { recursive: true });
const motions = {};
const JOBS = [
  ['katana_kesa', 'hammer/hammer_swing.png', atlas.motions.hammer_swing.frames],
  ['katana_walk_jodan', 'hammer/katana_walk_jodan.png', atlas.skins.hammer.katana_walk_jodan.frames],
];
for (const [name, file, frames] of JOBS) {
  const { png, packed } = packMotion(decodePng(readFileSync(resolve(src, file))), frames);
  writeFileSync(resolve(outDir, `${name}.png`), encodePng(png));
  motions[name] = { frames, packed };
  console.log(name, `${png.width}x${png.height}`);
}
writeFileSync(resolve(outDir, 'atlas.json'), JSON.stringify({ extras, partial: true, motions }) + '\n');
