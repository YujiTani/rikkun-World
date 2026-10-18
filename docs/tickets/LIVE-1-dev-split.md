# LIVE-1 開発の分け方（PO）

仕様 `docs/design/LIVE-1.md`。テストは先に入っている（e2e/live1-*.spec.ts、実績の数のユニット）。**テストの期待は変えない**（おかしいと思ったら報告）。手元は `npm run check:fast` と自分の関係する spec だけ。

## 順番
1. **つなぎ目（1 人）**: §7 の約束 1 のとおり `src/contracts.ts` に型と設定の初期値（§4.1）を足す。A・B・C の口の型（`AnimalApi`: rayHit・preview・feed・pet・forEachVisible、`AnimalView`、`AnimalDeps`: dropEgg・day・phase・countryAt ほか）も contracts.ts に置く。コミットしてから 2 へ。
2. **A しくみ・B 見た目と音・C ふりわけと画面** を別々の worktree で同時に（担当ファイルは §7 の表。他の担当のファイルはさわらない。contracts.ts は 1 で決めた物を使い、変えたいときは報告だけ）。
3. **つなぎ込み（1 人）**: 3 つをまとめて `src/main.ts`・`src/debug/testHook.ts` でつなぎ、e2e/live1-*.spec.ts・m7・m72・bucket・smoke を緑に。

## 見た目（B）
オーナー OK の形は A2: `/mnt/project-files/livestock/art/A2/proto/`（a2geo.ts・livestockA2.ts）と `docs/art/DESIGN.md` 16 章。1 わ 1 メッシュ、三角形 600 以下。LIVE-1 で作るのは にわとり だけ（うし・ぶた・やぎ は次）。音は `docs/audio/SOUND.md` の B「木のおもちゃとオルゴール」。
