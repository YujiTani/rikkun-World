// 設計（repair-final.json）から ゲームが 読む 数と、ユニットテストの 見本を 書き出す（手で 書きなおさない）。
// 使い方: node scripts/split-repair-final.mjs <repair-final.json>
import { readFileSync, writeFileSync } from 'node:fs';
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { scaffold_examples, ...game } = d;
writeFileSync('src/town/repairFinal.json', JSON.stringify(game, null, 1) + '\n');
writeFileSync('src/town/repairFinal.examples.json', JSON.stringify(scaffold_examples) + '\n');
