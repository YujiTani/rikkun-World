# PERF-thunder-warmup 指摘台帳

| 周 | ループ | 指摘した係 | 指摘（どこ・なに） | 原因の見立て | グループ | 状態 |
|---|---|---|---|---|---|---|
| 1 | dev | code-reviewer | 【軽微】thunderFx.ts makeRt: `isXRRenderTarget` は three 内部の印。three を上げて挙動が変わると、プログラム共有が黙って切れる（見た目は壊れず 500ms の ひっかかりだけ戻る）。E2E の `programs()` が 落雷の前後で ふえない ことを確かめる テストか、ユニットで three のバージョン固定を確かめると 気づける。 | three 内部の仕組みに頼る | | 未 |
| 1 | dev | code-reviewer | 【軽微】warmUp は RT の実体を作らない。最初の落雷の 1 コマで RT（色＋深さ）の確保が走る。warmUp で makeRt を先に呼べば さらに ひっかかりが へる（大きさは getDrawingBufferSize）。 | 確保が遅延 | | 未 |
