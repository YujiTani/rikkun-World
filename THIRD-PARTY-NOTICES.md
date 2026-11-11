# Third-party notices

既存の 出どころ（pixelfx の 燃える 物の つぶ）は `NOTICE.md` に ある。ここには LEGEND-4 以降に 足す 物を 書く。

## pixelfx — 大地のハンマーの 地面の われ・光（LEGEND-4 PR5）

- 使った 物: `public/models/fx/hammer_slam.png`（H1 ground-slam を 33 コマの 板に したもの。色は Earth/Gold 自作 7 色 ＋ 岩 #6b5a3c）。
- 出どころ: https://github.com/patch-gg/pixelfx の `src/fx/impacts/ground-slam.js`（MIT。ライセンスの 全文は 下の 黒龍の 項と 同じ）。`fx/tools/dump.mjs` で 97 コマを 書き出し、3 コマに 1 つを 6 × 6 の 板に した。

## pixelfx — 黒龍の 墨の すじ（LEGEND-4 PR1）

- 使った 場所: `src/fx/kokuryuInkPaint.ts`（墨の すじの 絵を 起動の とき 1 回 つくる）。ほかに `src/fx/kokuryuInkModel.ts`・`src/fx/kokuryuInkFx.ts`（ゲームの 十字の 板の 組み立て。これらは この リポジトリの 作り）。
- 出どころ: https://github.com/patch-gg/pixelfx の `src/fx/projectiles/rocket.js`（けむりの 並べ方・`cloud()` の 塗り方）と `src/fx/projectiles/_lib.js`（`cloud`・`blur`）を TypeScript に 写して 作り直した。ミサイルの 本体・炎は 入れて いない。色の 表は `c2.json`（c2_rocket-ink）の もの。
- `rocket.js` の けむりは Sprite Fusion の explosion（https://www.spritefusion.com/pixel-art-vfx/explosion）から（MIT License, Copyright (c) 2026 Hugo Duprez）。

```
MIT License

Copyright (c) 2026 Patch
Copyright (c) 2026 Hugo Duprez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
