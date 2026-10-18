# CHAR-5 指摘台帳

レビュー係・テスト係・計測係が指摘ごとに 1 行追記する。
「グループ」は PO が付ける（同じ・似た指摘には同じグループ名。例: G1）。
同じグループが **直したはずなのに 2 回再発（3 回目の出現）** したら停止。1 機能あたり全ループ合計 10 周で停止。

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | design | design-reviewer | 【重大】§6.1 の「こわれる今のテスト」に抜け。`e2e/char2.spec.ts`（62・138 行で `fetch('./models/char/atlas.json')`）と `e2e/helpers/blade.ts`（210 行で同じ fetch。刃の E2E の共通関数）が入っていない。`public/models/char/` の直下に atlas.json を置かない決まりなので 404 になり、blade 系の E2E が広く落ちる。「E2E ぜんぶ 直さない」とも合わない。`vite.config.ts` の `?charsheets=orig`（`art/char-sheets`）、`scripts/pack-char-atlas.mjs`、`src/main.ts`、`src/char/techCurves.ts`、`src/fx/bladeTrailModel.ts` も 6.1 か §4.5 に直す先を書く。→ `grep 'models/char\|art/char-sheets'` の全件を表にする | 作った人が検索し直していない（ルール D の自己チェック） | G1 | 未対応 |
| 1 | design | design-reviewer | 【重大】START-1 §8 との順番が決まっていない。タスク票は CHAR-5 が先で、CHAR-5 の AC2・AC9・AC11 と `e2e/char5.spec.ts` は「案内画面の左上の行」を作ってテストするが、START-1 は AC11 でその行を消す。作って消すと作り直し。CHAR-5 側に「START-1 が入ると行は消え、AC2・AC9・AC11 はスタートメニューの AC8・AC13・AC12 に置きかわる。消すテストと理由は台帳に書く」か、「CHAR-5 は行を作らず窓口 `char.set` と `?char=` だけ」かのどちらかを書く。PO 決定が必要 | 2 つの仕様を別々に書いたため | G2 | 未対応 |
| 1 | design | design-reviewer | 【軽微】要点 3 は「ふつう 2 秒以内」、AC9 は「本当の時間 5 秒以内」で数がちがう。GPU のない CI でゆれやすいので、AC9 は `loaded` / `ready` を待つだけにするか、上限を要点と合わせて書く | 数のそろえ忘れ | G3 | 未対応 |
| 1 | design | design-reviewer | 【軽微】§4.5 の男の子の「本当の値」が「（書く）」のまま。AC7・AC9 は `packed` から計算できるので止まらないが、tester の前に PO が埋める手順（§7 の 2）を依頼文にも書く | 仕様どおりの手順待ち | G3 | 未対応 |
| 1 | design | design-reviewer | 【軽微】案 B（男の子は刀・弓が絵に出ない）は 6 歳から見ると「武器をもっているのに見えない」。AC14 でオーナー確認になっているので進めてよいが、オーナー確認①で案 A/B をはっきり聞くこと | オーナー判断待ち | G4 | 未対応 |
