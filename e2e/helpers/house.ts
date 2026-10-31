import { expect, type Locator, type Page } from '@playwright/test';
import { findUnrubiedKanji } from '../../src/ui/text';
import { waitAnimationsDone } from './anim';
import { installAimHelpers } from './aim';

/**
 * HOUSE-1A（#338。docs/design/HOUSE-1.md §2.1〜2.4・§5・§6、docs/tickets/HOUSE-1A.md）の E2E が くり返し使う準備。
 * 数・座標・角度は 決め打ちしない: 建築士さんの 場所・スタート地点・ねらいは ゲーム（window.__rikkun）に 聞く。
 * 進めるのは step の数で、時間（ms）では 合否を 決めない（#255）。
 *
 * 窓口（仕様 §6.1）`window.__rikkun.house`:
 *   architects()      → { id, x, y, z, first, busy }[]    読みこまれて いる 建築士さん（x・y・z は 足もと）
 *   talk(id)          右クリックで 話すのと 同じ
 *   menu()            → { open, page: 'top'|'kura'|…|null, bubble, buttons: { id, enabled }[] }
 *   press(id, arg?)   メニューの ボタンを 押す
 *   kura()            → Record<itemId, number>     deposit(item, n) / withdraw(item, n) → 動いた 数
 *                     （deposit・withdraw は メニューが とじて いても 動く。くらへ 直接 あずける・とりだす。UI 検査の くらの 準備で 使う）
 *
 * ---- PO が 決めた つなぎ目の 約束（docs/tickets/HOUSE-1A.md「つなぎ目の 約束」。テストは これを 前提に する）----
 *   話す:   はじめての あいさつ（「こんにちは…」「これを あげる…」）は クリック なしで 進む。
 *           menu().open が true に なるのは、うなずきが おわって ボタンまで 出た とき（open が true なら ボタンは そろって いる）。
 *           はじめての 道具（みずもり・どうづき・ふで〔1B から。#339〕。アイテムの id は mizumori・dotsuki・fude）は open が true に なる 前に わたす。
 *   場所:   最初の 1 人の「横 6〜10 マス」は world.spawn() からの XZ の 直線きょり。
 *   くら:   右（あずけた 物）は 1 こ以上 ある 種類だけ 出す（0 に なった マスは 消える）。
 *   とじる: Esc は どの ページでも press('close') と 同じ（全部 とじる）。くらの 画面にも ✕（house-btn-close）を 置く（もちもの 画面と 同じ）。
 *   押せない ボタン: disabled か aria-disabled="true"（menu().buttons[].enabled が false の もの）。
 *   ふきだし: HTML（data-testid="house-bubble"）。頭の 上に 出す 置き方は 自由（house-menu の 中に なくて よい。どこに あっても 見つける）。
 *   くらの マス: div（button に するなら 1280×800 で 56px 以上。UI 検査の きまり）。画面は 今の UI 部品（src/ui/theme）。字の 大きさは 16/20/24/32/48 から。
 *   時刻・妖怪（票の やること 6・AC41）: メニュー・くらが 開いて いる 間は 止まる（本の 画面と 同じ）。とじると また 進む。
 *
 * ---- 仕様に 名前が 無い ので テストが 決めた 約束（開発は これに そろえる。変えるなら この ファイルだけ 直す）----
 *   ボタンの id（menu().buttons[].id・press(id)・DOM の data-testid="house-btn-<id>"）。上から この 順（§2.3）:
 *     kura（あずける・とりだす）｜editor（せっけいずを つくる。1A では「いえを つくる」。#339 で かわった）｜build（けんちくを はじめる）｜rename（なまえを かえる）｜tools（どうぐを もらう。道具を 持って いる ときは 出さない）｜close（とじる）
 *     press('close') は どの ページからでも メニューを 全部 とじる（Esc も 同じ）。くらの ✕ も data-testid="house-btn-close"。
 *   DOM（data-testid）:
 *     house-menu     上の メニューの 外わく（ボタン 6 つ。page 'top' の とき だけ ある）
 *     house-bubble   ふきだしの 字（menu().bubble と 同じ 字。画面の どこに あっても よい）
 *     house-kura     くらの 画面の 外わく（✕ ＋ 持ち物 ＋ くら ＋ 数の えらび。page 'kura' の とき だけ ある）
 *     kura-bag       左: 持ち物の マス（1 マス 1 つ。data-item="<id>"・data-count="<数>"。空きマスは data-item なし）
 *     kura-store     右: くらの マス（1 こ以上 ある 種類だけ。data-item="<id>"・data-count="<数>"）
 *     kura-count     下: 数の えらびの 数（はじめは 1。1 〜 動かせる 数 の 間）
 *     kura-minus10 / kura-minus1 / kura-plus1 / kura-plus10 / kura-all   数の えらびの ボタン（all = ぜんぶ）。kura- で 始まる 物は kura-count の ほか ぜんぶ 押せる 物（48px 以上を 見る）
 *     kura-deposit / kura-withdraw   「あずける」「とりだす」（持ち物の マスを えらんだ ときは あずける、くらの マスは とりだす だけ 出る）
 *   声の 効果音（audio.sfx() の 名前）: architect か kenchiku か popo か voice を ふくむ 名前（VOICE）。話すと ちょうど 1 回。
 *
 * ---- 1B（#339 エディター・せっけいず。docs/tickets/HOUSE-1B.md・仕様 §2.5〜2.7・§6.1）の 約束。テストの 関数は e2e/helpers/houseEditor.ts ----
 * フックの 形・座標は 仕様 §6.1 と 票「つなぎ目の 約束」の とおり（x・z は 中の 床の 左上 ＝ うしろ・ひだりの すみ から 0、家具は 左上の マス、
 * rot は みぎに まわす〔↻〕たびに ＋1）。仕様に 書いて ない 所を ここで 決める:
 *   editor()          エディターが 開いて いない とき null。開いて いる とき §6.1 の 形（step・size・windows・windowMax・windowKind・roof・windowCells・furniture・
 *                     selected・light・name・canUndo・canRedo・confirm・preview）。
 *   edit(op)          §6.1 の とおり（できたら true）。エディターが 開いて いない とき false。画面（DOM）は 次の step() で 追いつく。
 *   blueprints()      持ち物の せっけいず。name は editor().name と 同じ 形 { front, back }。number は 1, 2, 3 …（その 世界で 作った 順）。
 *   need(source?)     §6.1 の とおり。item は アイテムの id（log・stone・paper・cloth・string …）。
 *   menu()            page は 'top' | 'kura' | 'editor' | 'need'。確かめの まど（editor().confirm）が 出て いる 間も 'editor'。ひつような もの の
 *                     ポップアップが 出て いる 間は 'need'（うしろの エディターは 開いた まま）。open は エディターが 開いて いる 間 ずっと true。
 *                     buttons は page 'editor' では 画面に 見えて いる ボタン ぜんぶ（確かめの まどが 出て いる 間は yes・no だけ）、page 'need' では needClose だけ。
 *                     id は DOM の data-testid から "house-btn-" を とった 物。並びは 決めない（テストは 並べかえて くらべる）。bubble は エディターの ふきだし。
 *   press(id, arg?)   id は 上の buttons の id と 同じ（'width-7'・'furniture-futon'・'char-あ'・'next'・'done' …）。しゅるい・やねの ボタンは id に 値まで 入れた
 *                     'windowKind-shoji'・'roof-flat' の 1 引数の 形（arg なし）。仕様 §6.1 の 2 引数の 形 press('windowKind', 'shoji')・press('roof', 'flat') も 同じ ボタンを
 *                     押すので、実装は どちらも うけて よい。このテストが 使うのは 1 引数の 形 だけ。
 *   とじる:           ✕（house-btn-close）・Esc〔何も 出て いない とき〕は エディターを とじて メニューも ぜんぶ とじる（menu().open が false）。
 *                     できた！ が 通った とき だけ メニューの いちばん 上の ページ（'top'）に もどる。Esc の 順は AC55（確かめの まど → ひつような もの → 家具の えらび → エディター）。
 *   時間:             エディターの 1 コマ ＝ step() 1 回（ゲームの 時間が 止まって いても 見本の 角度は すすむ）。時刻・建築・妖怪は エディター・確かめの まど・ひつような もの の 間 止まる（AC41）。
 *   描画回数:         エディターが 開いて いる 間の step(n) の あと renderStats().drawCalls ＝ 見本を 描いた その コマの 回数（AC34 ③。本の 画面の 測り方〔AC16b〕と 同じ）。
 *   キー:             エディターの 中は Esc いがいの キーを ゲームの 操作に しない（W・E・Q・数字キー。AC14）。
 * ボタンの id（上の 1A の 続き。DOM の data-testid ＝ "house-btn-" ＋ id。引数が いる 物は id に "-引数" を つける）:
 *   どの すすみにも:   undo・redo（上の 帯）・close（✕）・new（あたらしい せっけいず）・need（ひつような もの）・done（できた！）
 *   すすみ:           next（つぎへ ▶。③ では 出さない）・prev（◀ まえへ。① では 出さない）
 *   ① そと:           width-5/7/9・depth-5/7/9（よこ・たて。aria-pressed が えらんで いる 大きさ）・windowsDown・windowsUp（まどの かず −＋）・windowKind-shoji・roof-flat（今は 1 つ ずつ。aria-pressed="true"）
 *   ② なか:           furniture-<アイテムの id>（13 種〔2.4〕: furnace・tansu・nukunuku・futon・table・long_table・round_table・chair・stool・andon・shelf・ofuro・haniwa。
 *                     long_table ＝ ながい テーブル〔3×1〕、round_table ＝ まるい テーブル、stool ＝ まるいす、haniwa ＝ はにわ。aria-pressed が 置く 家具の えらび。
 *                     ならびは 1 行 7 こ: 上 7 ＝ furnace・tansu・nukunuku・futon・table・long_table・round_table、下 6 ＝ chair・stool・andon・shelf・ofuro・haniwa）・light（あかりの わく）
 *                     置いた 家具を えらんだ ときだけ そばに take（とる）・turnRight（↻）・turnLeft（↺）。aria-label は「とる」「みぎに まわす」「ひだりに まわす」。↻ ↺ に 字は ない
 *   ③ なまえ:         char-<ひらがな 1 字>（50 音の ボタン。小さい っ ゃ ゅ ょ と ー も。カタカナに しても id は ひらがなの まま。押すと 入る 字は カタカナ）・dakuten（゛）・handakuten（゜）・
 *                     katakana（カタカナ きりかえ。aria-pressed）・erase（1 もじ けす）・suffix-0〜4（後ろの 文字。のいえ・ハウス・のおうち・ひみつきち・のやしき の 順。aria-pressed）
 *   確かめの まど:    yes・no（ふとん だけ ＝［このまま つくる］［かぐを おく］／あたらしい せっけいず ＝［ぜんぶ けす］［やめる］）
 *   ひつような もの:  needClose
 *   押せない（enabled が false）: 1A と 同じ（disabled か aria-disabled="true"）。9 字目の char-*・つけられない 字の あとの dakuten・handakuten・上限の windowsUp・0 の windowsDown・canUndo/canRedo が false の undo/redo。
 * DOM（data-testid）:
 *   house-editor     エディターの 画面ぜんたい（page 'editor' の とき だけ ある）
 *   editor-title     上の 帯の タイトル「おうちの 設計図を 作ろう」（漢字に ruby）
 *   editor-heading   すすみの 見出し（①「おうちの 外観を かんがえよう」②「おうちの 内装を かんがえよう」③「設計図に おなまえを つけよう」。ふきだしが 出て いる 間は 見えない）
 *   editor-progress  すすみ ①②③ の 印（押せない。<button> に しない）。中は editor-step-soto・editor-step-naka・editor-step-namae。いま いる 所に aria-current="step"
 *   editor-preview   見本の はこ（絵は レンダラーが 描く。この はこは すきとおって いる。PR-2 で ドラッグを うける）。③ では ない。大きさは §3.2 の「表から 出る 大きさ」
 *                     ＝ ① 580×484・720×540・796×604、② 480×276・658×288・723×332（1024×700・1280×800・1440×900。UI 検査が はかる）
 *   editor-grid      ② の 方眼の 外わく（div）。中の マス ＝ editor-cell（data-x・data-z。よこ×たて こ。9×9 の ときの 大きさは 48・54・61 px の 正方形）、置いた 家具 ＝ editor-furniture（data-kind・data-x・data-z・data-rot）。どれも div
 *   editor-name      ③ の 今の 名前（前の 字 ＋ 後ろの 字）
 *   house-bubble     ふきだし（1A と 同じ。エディターでは 見出しの だんに 重なる。menu().bubble と 同じ 字）
 *   house-confirm    確かめの まど（エディター: data-kind="reset" か "futonOnly"〔editor().confirm と 同じ〕。1C PR-2 の 上空の 視点の まど: data-kind="build"）
 *   house-need       ひつような もの の ポップアップ。1 行 ＝ need-row（data-item・data-need・data-have・data-short。need() と 同じ 順）。材料は 10 しゅるいまで（2.4）。1024×700 だけ 行の ところが スクロール
 * 余白（§3.2 の 2.4 の 表。UI 検査 layoutTableIssues〔e2e/helpers/houseEditor.ts の LAYOUT〕が はかる。列は 1024×700・1280×800・1440×900。±1.5px）: 画面の ふちから ボタンまで
 *   16・24・32px 以上（上下左右）、下の 帯の ボタン（prev・next・done・new・need）の 高さ 56・64・64、① ② の ボタンの 高さ 56・64・64（② の 家具の ボタンは 正方形）、
 *   ③ の キー（char-*・dakuten・handakuten）は 正方形・後ろの 文字（suffix-*）・katakana・erase の 高さ 56・56・64。見本・マスの 大きさは 上の editor-preview・editor-grid。
 * 文（空白は くらべない）: 仕様 §3 の ふきだしの 表と 確かめの まど。エディターの ふきだしは 次に どこかを 押すと すぐ 消える。出て いる 長さは 180 コマ ＋ 字 1 つ 12 コマ（§4.9）。
 *
 * ---- 1B PR-2（#339。見本を まわす・窓と 戸の 光り・よくない ことば。仕様 §2.5・§2.6・§4.9・§6.1、AC50・AC56・AC58）の 約束。仕様に 書いて ない 所を ここで 決める ----
 * 窓口（step は 進めない。呼んだ その場で editor() が 新しい 値に なる。画面〔DOM〕は 次の step で 追いつく）:
 *   previewDrag(dx, dy)   今の 見本の 上で 押して dx・dy px 動かして はなした のと 同じ。返り値 { angle, pitch }（editor().preview と 同じ 値）。touched: true・wait: 600（動きを へらす 設定では wait: null のまま）。
 *                         よこ 1 px ＝ 0.5°（右 ＋dx で angle が へる・0 を こえたら 360 から）、たて 1 px ＝ 0.5°（下 ＋dy で pitch が ふえる・そと 10〜80・なか 30〜80 で 止まる）。
 *                         見本が 出て いない（③）・エディターが 開いて いない・確かめの まど／ひつような ものが 出て いる 間は 何も かえない（返り値は 今の { angle, pitch } か null）。
 *                         置いた 家具の えらび（selected）は はずれる。もどす／すすむ の 記録には 入らない・保存にも 入らない。
 *   previewWheel(dx, dy)  wheel（deltaX・deltaY）を 1 回 うけた のと 同じ。(dx ＋ dy) px を よこの ドラッグと 同じ 0.5°／px で（足した 数が ＋ なら 右へ ドラッグと 同じ 向き）。pitch は かわらない。
 *                         touched: true・wait: 600（1 回ごとに 600 から）。そのほかは previewDrag と 同じ。
 *   hover(id | null)      その ボタンに マウスを のせた のと 同じ（null で はなす）。id は 画面の ボタンの id（'windowsUp'・'windowsDown'・'windowKind-shoji'。'windowKind' でも よい）。
 *                         ほかの id（'next'・'width-7' …）は 光らせない（glow は null の まま）。本物の マウスで のせても 同じ（DOM の mouseenter／pointerenter）。
 *   editor().preview      { mode, roof, angle, pitch, touched, wait: number | null, builds, glow: { door: boolean, cells: { wall, i }[], left: number | null } | null }（③ では null）。
 *                         wait は ドラッグ・wheel の はなした 直後 600（押して いる 間は 600 の まま）、1 コマごとに 1 へり、0 で null。見えて いない すすみ（① ② の かたほう・③）は へらない・angle も すすまない。
 *                         glow は 光って いない とき null。窓を かえた 光り ＝ { door: false, cells: 光る 窓と なくなった 窓の あとの マス（前と 後の windowCells の ちがう 所）, left: 90 → 0 }。
 *                         ① に なった 戸の 光り ＝ { door: true, cells: [], left: 90 → 0 }。ボタンに のせた 光り ＝ { door: false, cells: 窓 ぜんぶ, left: null }（のせて いる 間 ずっと）。
 *   builds                形が かわった とき と 光りの 始まり・終わり（それぞれ ＋1。同じ コマに 重なれば まとめて ＋1 でも よい）。回る だけ・ドラッグ・wheel・また 回り出す・光って いる 間は ふえない。
 * 画面（DOM の data-testid）:
 *   editor-preview        見本の はこ。本物の マウスの ドラッグ（pointerdown → move → up）・wheel を うける。ドラッグ中に はこの 外へ 出ても はなすまで まわせる。はなした 所の ボタンは 押さない。
 *   editor-hand-mark      見本の 右下の すみの 小さな「くるっ」の 手の 印。さわる 前の 見本に 1 こ（① ② べつべつ・動きを へらす 設定でも 出す）、さわったら 0 こ（また 回り出しても 0 こ）。
 *                         字（か aria-label）に「くるっ」。見本の はこの 中に ある。見本の ドラッグを じゃましない（pointer-events: none）。
 *   editor-mark-window    ② の 方眼の かべの 帯の 窓の 印。まどの かず ＝ editor().windows こ。場所は 帯の 位置で 見る（windowCells の かべ・番号〔左右 対称 なので 向きは どちらでも よい〕）。
 *   editor-mark-door      ② の まえの かべの 帯の まん中に 戸の 印 1 こ（帯から 少し はみ出して よい）。
 * よくない ことば（AC58）: 前の 文字の 末に 入れた 字（edit char）・゛ ゜（press dakuten／handakuten）・後ろの 文字（edit suffix）で、そろえた 名前に 表の ことばが 入ると false（press は 何も かえない）。
 *   名前・canUndo は かわらず、ふきだし「その ことばは おなまえに いれたら だめだよ」。erase は 止まらない。読みこんだ 作りかけに よくない ことばが あると、すすみに よらず ③ なまえ で 開いて 同じ ふきだし。
 *   できた！（done）も 止まる（③ のまま・かみ／ふで／せっけいずは かわらない）。
 *
 * ---- 1C PR-1（#340 家の 中身。docs/tickets/HOUSE-1C.md「PR-1」・仕様 §2.6・§2.11・§2.13・§3.3・§4.6・§4.8・§6.1）の 約束。テストの 関数は e2e/helpers/houseBuilt.ts ----
 * 家は テスト用の フックで せっけいずから その場に 建てる（建築の 手順・材料・地盤・上空の 視点は PR-2）。開発は この 約束に そろえる。変えるなら この ファイルだけ 直す。
 * 方位: 家の まえ（戸の ある がわ）＝ 南 ＝ +z。方眼の 下 ＝ 南（+z）・上 ＝ 北（−z）・左 ＝ 西（−x）・右 ＝ 東（+x）。向き rot: 0 ＝ 前が 南 → 1 ＝ 西 → 2 ＝ 北 → 3 ＝ 東（↻ ＝ 上から 見て 時計まわり）。
 *
 *   house.buildNow(number, at) → HouseRec | null    せっけいずから 家を その場に 建てる（建築が おわった 形を いっぺんに 置く）
 *       number ＝ せっけいずの 番号（`blueprints()[i].number`。持ち物に のこって いなくても 保存の 中身に あれば 建てる）。知らない 番号は null
 *       at ＝ { x, y, z }: 家の 外の 箱の 北西（−x・−z）の すみの、床の 段の 高さ。外の 箱は x..x+w+1・z..z+d+1・y..y+4（w・d ＝ せっけいずの よこ・たて。床 1 ＋ 中 3 ＋ 屋根 1）
 *       箱の 中の ぜんぶの マスを 書く（AC49）: 床の 段 ＝ 外の 箱ぜんぶ `house_floor`・屋根の 段 ＝ ぜんぶ `house_roof`・中の 3 段の 外まわり ＝ `house_wall`
 *         〔まえの かべの まん中の 1・2 段目 ＝ `house_door`（しまって いる）。窓 ＝ 2 段目の `windowCells`（§4.2）の 場所に `shoji`〕・中の 3 段目の まん中 ＝ `lantern`・
 *         家具 ＝ せっけいずの マス・向き（1 段目。ふとんは 頭 `futon*` ＋ 足 `futon_foot_*`）・のこりの 中の マス ＝ `air`
 *       形の 式は `src/house/editor/model.ts`（`windowCells`・`doorIndex`・`footprint`）。テストも そこを 読んで 期待を 作る
 *       材料・せっけいず・持ち物は へらさない。世界の 書きかえは ふつうの `world.setBlock` と 同じ 道（blockWatch の 知らせ・光・メッシュ）。家の 記録を 1 件 つくる
 *   house.houses() → HouseRec[]                     戸で おぼえた 記録（できた 順）。戸が こわれると 消える（AC52）
 *       HouseRec ＝ { id: number | string, name: string, number: number, outer: { w: number, d: number }, door: { x, y, z }, doorOpen: boolean }
 *         name ＝ 前の 文字 ＋ 後ろの 文字（建てた ときの せっけいずの 名前。なまえを かえる で かわる）・number ＝ せっけいずの 番号・outer ＝ 外の 寸法（w＋2・d＋2）・
 *         door ＝ 戸の 下の マス（まえの かべの まん中・床の 上の 1 段目）・doorOpen ＝ あいて いるか（建った ときは false）
 *   house.blockAt(x, y, z) → { id: BlockId | 'outside', item: ItemId | null, dir: 0 | 1 | 2 | 3 | null }
 *       id ＝ `world.getBlock` と 同じ・item ＝ そこを ほると 手に 入る アイテム（ふとんは 頭も 足も `futon`、戸は 上も 下も `house_door`、空気は null）・
 *       dir ＝ 向きを 持つ ブロック（家具）の rot（上の 向き）、持たない 物は null。ブロックの id の 作り方〔向きごとに 別の id か〕は 決めない ため、家具は これで たしかめる
 *   ui.houseNameBand() → { text: string, ticksLeft: number } | null
 *       text ＝ 家の name そのまま（かぎかっこ なし）。ticksLeft ＝ あと 何ステップ 出すか: 出はじめは 180（179 も ゆるす）、1 ステップごとに 1 へり、`step(ticksLeft)` で null。
 *       DOM は data-testid="house-name-band"（出て いない 間は 見えない か ない）。今の 上の 帯の 列に ならぶ 作りで よい（要素に この testid を つける）
 *   戸: ブロックの id は `house_door` で はじまる（あけ・しめで 別の id に して よい。上下 2 マス）。右クリックで あけしめ（上下 どちらを ねらっても 2 マスとも）。
 *       しまった 戸は プレイヤーが 通れない・あいた 戸は 通れる。あいた 戸も ねらえる（`target.get()` に 出る）。ねらうと 右の 案内（`hud.actionHint().right`）が 出る:
 *       しまって いる ＝「あける」・あいて いる ＝「しめる」（E2E では ことばが 空でなく、あけしめで かわる ことだけ 見る。ことばは ユニット〔#37〕）
 *   窓 `shoji`・かべ・床・屋根は 固い（通れない）。ほると それぞれ 同じ id の アイテム 1 こ（`inventory.count`）。戸は 上下 どちらを ほっても 2 マス 消えて `house_door` 1 こ
 *
 * ---- なまえを かえる（§2.6・AC53）。上の メニューの `rename` は 家が 1 けん 以上 あるとき だけ 押せる ----
 *   menu().page: 'rename'（建てた 家の 一覧。ふきだし「どの いえの なまえを かえる？」）・'renameName'（名前の 画面。はじめは 今の 名前）
 *   'rename'     ボタン: `renamePick-<家の id>`（プレイヤーから 近い 順に 上から）・`close`（✕）。press('renamePick', 家の id) も 同じ。DOM の 外わくは data-testid="house-rename"
 *   'renameName' ボタン: ③ なまえ（1B）と 同じ `char-<ひらがな>`・`dakuten`・`handakuten`・`katakana`・`erase`・`suffix-0〜4` ＋ `renameOk`（これで いい！）・`renameCancel`（やめる）。
 *                今の 名前の 字は data-testid="rename-name"。外わくは data-testid="house-rename-name"。ふきだしは `house-bubble`（menu().bubble と 同じ）
 *   house.renaming() → { id, name: { front: string, back: string } } | null   名前の 画面で 作っている 名前（ほかの ページでは null）
 *   `renameOk`: 前の 文字が 0 字 → 何も かわらず ふきだし「なまえを つけてね」（ページは そのまま）。1 字 以上 → `houses()` の name が かわり、ページは 上の メニューに もどる。
 *               せっけいずの 名前〔`blueprints()`〕は かわらない。`renameCancel`: 何も かえず 上の メニューへ
 *
 * ---- 1C PR-2（#340 地盤と 建築。docs/tickets/HOUSE-1C.md「PR-2」・仕様 §2.8〜2.10・§3.4・§4.1・§4.4〜4.7・§6.1・AC16〜AC23・AC31・AC32c・AC36・AC39〜AC41・AC51）の 約束。テストの 関数は e2e/helpers/houseSite.ts ----
 * PR-1 の 約束（方位・向き・houses()・blockAt・戸・名前の 帯・なまえを かえる）は そのまま 使う。足場・道具の 見た目（案 B）と 音（案 A）の 細部は 見ない（出た／出ない・数・動きの 有無 だけ）。
 *
 * 道具（§2.9・§4.4）: みずもり `mizumori`・どうづき `dotsuki` を 手に 持って（`inventory.select`）地面を 右クリック（`input.press('secondary')`）。
 *   house.level() → { base: { x, y, z } | null, cells: { x, z, state: 'high' | 'low' | 'ok' }[] }
 *       みずもりで 地面を 右クリックすると base ＝ その ブロック、cells ＝ base を まん中に した 13×13 の ぜんぶの 列（'ok' も 入る。169 こ）。高さの ものさしは base の y。
 *       state ＝ その 列の いちばん 上の 固い ブロック（base の −4〜+5 の 間。草花・はっぱは 見ない）が base より 高い ＝ 'high'・低い ＝ 'low'・同じ ＝ 'ok'（−4〜+5 に 固い ブロックが ない 列は 'low'）。
 *       ほる・おくで 高さが かわると、そのステップの うちに state が かわる。base は 持ちかえても のこる（新しく 右クリックするまで）。cells が 出るのは みずもりを 手に 持って いて、
 *       base から 横 16 マス 以内の 間 だけ（持ちかえた・16 マスを こえて はなれた 間は []）。まだ 右クリックして いない 間は base ＝ null・cells ＝ []。
 *       みずもりを 持った まま 左クリックで ほれる（手と 同じ）。
 *   どうづき: 右クリックで たたく。20 ステップに 1 回だけ 効く（その 間の 右クリックは 何も おきない・音も 鳴らない）。たたいた ブロックを まん中に した 3×3 の うち、
 *       たたいた ブロックと 同じ 高さで 上が 空気（か 消える 草花）の くさ `grass`・つち `dirt`・すな `sand`・ゆき `snow` が `katame_tsuchi`（かためた つち）に なる。石や 高さが ちがう 所は かわらない。
 *       かためた つちを ほると つち `dirt` が 1 こ。かためた つちを たたくと 何も かわらない（小さい 音だけ）。
 * 音（`audio.sfx()` の 名前。サウンドの 案 A〔/mnt/project-files/housing-art/house-1c/sound/install-A.diff.txt〕の とおり）:
 *   みずもり ＝ 'mizumori' 1 回／どうづき ＝ 'dozukiCall1'〜'dozukiCall4' の どれか 1 つ ＋ 'dozukiThud' 1 回（掛け声は 直前と 同じ 物が 続かない）／かためた つちを たたく ＝ 'dozukiSoft' 1 回 だけ／
 *   ［ここに たてる］＝ 'tonkachiStart' 1 回／建築中の とんかち ＝ 'tonkachi'・'tonkachi2'・'tonkachi3'（戸から 16 マス 以内の ときだけ）／完成 ＝ 'houseDone' 1 回。
 *
 * けんちくを はじめる（§2.8・AC18〜AC20・AC51）:
 *   上の メニューの `build`: 建築中は enabled false。せっけいずが 0 まいでも 押せて、ふきだし「せっけいずが ないよ。…」（page は 'top' の まま）。
 *   press('build') → menu().page 'pick'（持ち物の せっけいずの 一覧。DOM は data-testid="house-pick"）。ボタン: `pick-<せっけいずの マスの 番号>`（blueprints()[i].slot。press('pick', slot) も 同じ）・`close`。
 *   材料が たりない せっけいずの `pick-*`（うすい カード）は enabled false（press すると page 'need'・たりない 行の short ≧ 1・ふきだし「ざいりょうが たりないよ」）。
 *   うすい カードの DOM は aria-disabled="true" に して、`disabled` には しない（本物の マウスで 押すと 同じく page 'need' に なる。E2E が 1 回 実クリックで ためす）。
 *   そろって いる せっけいずを press('pick', slot) すると 上空の 視点（page 'sky'）。置ける 場所が 1 つも なければ page は 'pick' の まま、ふきだし「かためた つちの ばしょが ないよ。みずもり と どうづき で つくってね」。
 *   house.sites() → { x, y, z }[]     上空の 視点の 間の 置ける 場所（ほかの 間は []）。x・z ＝ 外の 箱の 北西（−x・−z）の すみ、y ＝ 床の 段の 高さ（PR-1 の buildNow の `at` と 同じ）。
 *   house.cursor() → { x, z, ok, confirm, screen: { x, y } } | null     上空の 視点の 間だけ。x・z ＝ わくの 北西の すみ（sites() と 同じ 座標）・ok ＝ そこに 建てられる・confirm ＝ 確かめの まどが 出て いる・screen ＝ わくの まん中の 画面の 位置（CSS px）。
 *       はじめの わくは 置ける 場所の いちばん 近い 所。
 *   上空の 視点の 操作: 矢印・WASD で 1 マス（cursor().x・z が 1 かわる）／マウスを 動かすと わくが マウスの 下へ／Enter か 左クリック ＝ 決定（まどが ない とき）→ cursor().confirm が true、
 *       まどが ある とき の Enter ＝［ここに たてる］／Esc ＝ まどが あれば［やめる］（わくは そのまま）、なければ 'pick' へ もどる。ボタン: `back`（◀ もどる。Esc と 同じ）。
 *       確かめの まどの 間の ボタンは `yes`（ここに たてる）・`no`（やめる）だけ。DOM は house-sky（上の 帯。案内 ＋ back）・house-confirm（data-kind="build"。2 行目に 家の 名前）。ふきだしは house-bubble。
 *   `yes`（か Enter）で 建築開始: menu().open が false、くらから need() の need の 分だけ へる（せっけいずは のこる）、音 'tonkachiStart'。
 *       プレイヤーが 場所の 中に いたら 戸の 前の 外へ うつる。建築を 始めた 建築士さんは 戸の 前（3 マス 以内）に うつる。
 *   house.firstBonus() → boolean     その 世界で まだ 1 けんも 建て はじめて いない（ふとん 1 つぶんの おまけが ある）。need() の ぬの・いとは {need: 0, bonus: 3 / 1}。
 *
 * 建築（§2.10・§4.1・§4.5・AC21・AC22・AC39・AC40・AC41）:
 *   settings.set('houseBuildTicks', n) … 建築の 長さを n ステップに 固定（どんな 大きさでも）。設定は 数だけ（null は 使わない）。初期値 0 ＝ 仕様 §4.1 の 式 〔9,000＋900×(よこ＋たて−10)〕。保存された 建築は 保存した ときの 長さで つづく。
 *   house.building() → { name, w, d, progress, leftTicks, leftText, at } | null
 *       name ＝ 家の 名前（前の 文字 ＋ 後ろの 文字）・w d ＝ せっけいずの 中の よこ・たて・progress ＝ 0〜1（たった ステップ ÷ 長さ）・leftTicks ＝ のこりの ステップ・
 *       leftText ＝ 'はじめた ばかり だよ'（進み 1/3 未満）｜'まだまだ かかるよ'（4/5 未満）｜'もうすぐ おわりそう！'・at ＝ 場所の 北西の すみ { x, y, z }（床の 段。sites() の 1 件と 同じ）
 *   進みは 世界の 時計（step の 数）で 進む。メニュー・上空の 視点・エディターが 開いて いる 間は 進まない（AC41）。
 *   見た目の 段階（§4.5）: 進み 0〜15% ＝ 足場だけ（house_wall なし）／15〜85% ＝ 壁が 少しずつ（house_roof なし）／85〜100% ＝ 屋根・家具・ちょうちん。
 *   足場: アイテムに ならない 固い ブロック（house.blockAt() の item が null で id が 'air' でない）。完成で ぜんぶ 消える。建築中の 場所（外よこ × 外たて × 高さ 5）は
 *       ブロックを 置く・ほる が 失敗し（ブロックは かわらない・持ち物も かわらない）、プレイヤーは 歩いて 入れない（テレポートは のぞく）。
 *   建築士さんに 話す（建築中）: menu() は page 'top'・bubble に 家の 名前と leftText（空白は くらべない）・`build` は enabled false。
 *   建築中の 場所の まん中から 横 16 マス 以内では 妖怪が 湧かない（yokai.events() の spawn の 位置で 見る）。
 *   完成: building() が null・houses() に 1 件（doorOpen false）・足場が ぜんぶ 消える・house.celebrate().confetti が ちょうど 1 ふえる・'houseDone' が 1 回・上の 帯「<名前> が できた！」。
 *   house.celebrate() → { confetti: number, banner: { text: string, ticksLeft: number } | null }     confetti ＝ 出した 紙ふぶきの 回数（ずっと 数える）。banner の DOM は data-testid="house-done-banner"。
 *   保存（AC32c）: save.now() → 開きなおすと building() の progress・name・w・d・at が 同じ（leftTicks も 同じ）で、世界の ブロック（足場・壁）も 同じ。のこりの ステップで 完成。
 *   音と 紙ふぶき: どうづき・あずける・話す・せっけいずが できた では confetti は ふえない。
 *
 * ---- 1D（#341 家具の はたらき。docs/tickets/HOUSE-1D.md・仕様 §2.12・AC28・AC54）の 約束。テストの 関数は e2e/helpers/houseFurn.ts。ユニットは src/house/seat.test.ts ほか ----
 * 窓口（step は 進めない。呼んだ その場の 値を 返す）:
 *   house.seat() → { kind: 'sit' | 'bath'; block: { x, y, z }; position: { x, y, z } } | null
 *       いす・まるいすに 座って いる（kind 'sit'）／おふろに 入って いる（kind 'bath'）あいだだけ 値。立つ・出る・当たって 立つと null。座る 前・座れない 家具〔ほんだな・テーブル …〕は null。
 *       block ＝ 右クリックした ブロックの マス。position ＝ プレイヤーの 足もと（座って いる あいだ かわらない。`player.get().position` と 同じ 値）。
 *       src/house/seat.ts の `SeatSystem.seat()` と 同じ 形（ユニットの 約束）。
 *   ほんだな: 右クリックで 本が ひらく。窓口 `lock.get()`（BOOK-1。e2e/helpers/book.ts の BookState）が 動きの おわりで bookOpen: true・bookView: 'toc'（① もくじ）。
 *       本の 動き（bookAnim）は ステップで 進む（時間では 待たず `settle`）。ほんだなを ねらうと 右の 案内（`hud.actionHint().right`）が 出る（ことばは ユニット）。
 *   右クリックは 家具へ 向けた 1 回の 押して はなす（tapRight）。座る・入る・本は 持ち物に よらず はたらく。
 *
 * ---- 1E の 約束（#374 使いやすく。docs/tickets/HOUSE-1E.md・仕様 2.5 版 §2.5・§3.2・§4.3・§4.9・§6.1、AC13・AC13c〜AC13g・AC35c・AC37b・AC44・AC57）----
 * 実装は この 約束に そろえる。変えるなら この ファイルだけ 直す。E2E は e2e/house1e.spec.ts、関数は e2e/helpers/houseEditor.ts（originOf・plain・Bad）。ユニットは src/house/editor/*.test.ts と src/house/system.test.ts。
 * いまは 「内装の 仮置き」の 分だけ。「材料」〔くら＋もちもの＋近くの たんす。AC9b・AC20b・AC34 ⑤ ほか〕の 約束は yuzu と くらの 形を 決めなおして いる ので、決まったら ここに 足す。
 *
 * 〔内装の 仮置き〕方眼の 中の マスを 押せば どこでも 置けて、置けない 所に ある 家具は 赤（`bad`）。
 *   editor().furniture[]   { kind, x, z, rot, origin: { x, z }, bad: 'out' | 'door' | 'overlap' | null }。ならびは 置いた 順（あとから 置いた 物が 後ろ。まわしても 順は かわらない）。
 *                          x・z ＝ 今の 形（まわした あと）の 左上〔保存と 同じ。赤い 家具では 0 より 小さい・よこ／たて 以上 にも なる〕、rot ＝ 向き。
 *                          origin ＝ もとの マス（向き 0 の 左上。ふとんは まくらの マス。rot 0 では x・z と 同じ）。かど ＝ rot 0 左上・1 右上・2 右下・3 左下（仕様 §4.3）。
 *                          bad ＝ 赤い わけ。2 つ 以上 あてはまる ときは out → door → overlap の 1 つ目。重なった ときは 両方 `'overlap'`。形から 毎回 決まり、保存しない。
 *                          blueprints()[].furniture は 今まで どおり { kind, x, z, rot }（origin・bad は つけない。せっけいずに なる 家具は 赤く ない 物 だけ）。
 *   editor().selected      { i, x, z } | null。i ＝ furniture の 番号、x・z ＝ その 家具の もとの マス。まわしても かわらない。重なった マスを 押すと あとから 置いた 方。
 *   editor().flash         { items: number[], seq: number } | null。赤く 光らせた 家具の 番号（小さい 順）と、光らせる たびに 1 ふえる 数。まだ 光らせて いなければ null。
 *   editor().preview.furniture   見本に 出して いる 家具の 数。赤い 家具は 出さない（建つ 形 だけ）。ふつうの 色に なると 出て、`preview.builds` が 1 ふえる。
 *   edit({ op: 'place', kind, x, z, rot? })   x・z ＝ 押した マス ＝ もとの マス（rot が あっても。左上は rot から 決まる）。方眼の 中の 空いた マスなら 赤く なる 所でも true。
 *                          方眼の 外の マス・もう 家具が ある マスは false。edit({ op: 'select' | 'remove' | 'rotate', x, z }) の x・z ＝ その 家具の どれかの 方眼の 中の マス
 *                          〔重なって いれば あとから 置いた 方〕。rotate は 赤く なる 向きでも true。ただし もとの マスが 方眼の 外で 1 マスも 入らなく なる ときだけ false
 *                          〔furniture・canUndo は かわらない。flash が { items: [その 番号], seq: +1 } に なる〕。
 *   まわす                 ↻ ↺（`turnRight`・`turnLeft`・edit rotate）は もとの マスを 中心に まわる。1×1 は その場で rot だけ。もどす 1 回で 1 つ 前の 向き。
 *   つぎへ・できた！        赤い 家具が 1 つでも ある 間、② の `next`（② → ③）と `done`（どの すすみでも）は 進まない・何も へらない・せっけいずも できない。
 *                          step は 'naka'（done が ① ③ から でも ② に 切りかわる）、menu().bubble は「あかい かぐを なおしてね」、
 *                          editor().flash が { items: 赤い 家具 ぜんぶの 番号, seq: +1 }、形・canUndo・せっけいずは かわらない。ボタンは うすく ならない（next・done とも enabled true）。
 *                          できた！の しらべでは いちばん 先（ふとん 0・名前 0 字 より 先）。① の `next`（① → ②）・② の `prev` は 赤くても 進む。
 *                          赤を なおして（まわす・とる・大きさ）から `next` で 'namae'。
 *   開く                   赤い 家具が ある 作りかけは、保存の step や 名前の よくない ことばに よらず step 'naka' で 開く。セーブ → 開きなおしても 赤い 家具が のこる（x・z・rot・origin・bad が 同じ）。
 *   大きさを かえる         1 マスでも 方眼に 入る 家具は 消さずに 赤く のこす。1 マスも 入らなく なった 家具だけ 消え、ふきだし「はいらない かぐを かたづけたよ」（消える 家具が なければ 出ない）。
 *   画面（DOM）            editor-furniture（data-kind・data-x・data-z〔左上〕・data-rot・data-i〔furniture の 番号〕）に、赤い 家具だけ data-bad="out|door|overlap" を つける
 *                          〔ふつうの 家具には 属性を つけない〕。editor-ghost ＝ 置く 前の 形（ふつうは hidden）。見える 間は、赤い とき だけ data-bad を つける。
 *                          家具の ある マスの 上では editor-ghost を 出さない。方眼の はこ（かべの 帯 こみ）の 外は 描かない。帯の 上に 見えて いる 赤い 家具の はみ出しを 押しても その 家具を えらぶ。
 *                          そばの ボタン（take・turnRight・turnLeft）は 方眼の はこの 中に おさまる。
 *   音                     赤く 置いた・赤く なる 向きに まわした ときの 音は ふつうと 同じ（E2E では 見ない。オーナー確認）。
 */

export interface Architect {
  id: number | string;
  x: number;
  y: number;
  z: number;
  first: boolean;
  busy: boolean;
}

export interface MenuState {
  open: boolean;
  page: string | null;
  bubble: string;
  buttons: { id: string; enabled: boolean }[];
}

/** 上の メニューの ボタンの 並び（§2.3）。tools は 道具が ない ときだけ */
export const BTN_ORDER = ['kura', 'editor', 'build', 'rename', 'tools', 'close'] as const;

export const TID = {
  menu: 'house-menu',
  bubble: 'house-bubble',
  kura: 'house-kura',
  btn: (id: string) => `house-btn-${id}`,
  bag: 'kura-bag',
  store: 'kura-store',
  count: 'kura-count',
  minus10: 'kura-minus10',
  minus1: 'kura-minus1',
  plus1: 'kura-plus1',
  plus10: 'kura-plus10',
  all: 'kura-all',
  deposit: 'kura-deposit',
  withdraw: 'kura-withdraw',
} as const;

/** 声の 効果音の 名前（仕様に 名前が 無い。サウンドが 名前を 決めたら ここだけ 直す） */
export const VOICE = /architect|kenchiku|popo|voice/i;

export const tid = (page: Page, id: string) => page.getByTestId(id);

/** 見えている 要素だけ（同じ data-testid の 隠れた 物が 残って いても まよわない。✕ は 上の メニューにも くらにも ある） */
export const shownTid = (page: Page, id: string): Locator => tid(page, id).filter({ visible: true });

/** 新しい 世界を 開く（既定は ?nosave=1）。一時停止・ロックを まねる・妖怪も 動物も 出さない・持ち物を 空に・音を 使える ように する */
export async function openHouse(page: Page, query = '?nosave=1'): Promise<void> {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  // 窓口（仕様 §6.1）が まだ 無い ときは、ここで 分かりやすく 落ちる（実装の 前の 赤）
  expect(
    await page.evaluate(() => typeof (window as any).__rikkun?.house?.architects),
    'window.__rikkun.house（仕様 §6.1 の テスト用 窓口）が まだ ない',
  ).toBe('function');
  // 最初のクリックで 音が 使えるように なる（unlock）。ないと audio.sfx() の 記録が 空の まま（SOUND-1 の openGame と 同じ）。
  // このとき 本物の ポインターロックも かかる ので、下で はなす（のこると 画面の ボタンを マウスで 押せない）
  await page.mouse.click(0, 0);
  await installAimHelpers(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
    h.lock.simulate(true);
    document.exitPointerLock();
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.settings.set('animalAutoSpawn', false);
    h.yokai.clear();
    h.animals.clear();
    h.inventory.clear();
    h.step(2);
    h.audio.sfx(); // 記録を 空に する
  });
  await page.waitForFunction(() => !document.pointerLockElement);
}

export const stepUi = (page: Page, n = 2): Promise<void> => page.evaluate((n) => (window as any).__rikkun.step(n), n);

export const spawnPoint = (page: Page): Promise<{ x: number; z: number }> =>
  page.evaluate(() => {
    const s = (window as any).__rikkun.world.spawn();
    return { x: s.x as number, z: s.z as number };
  });

export const architects = (page: Page): Promise<Architect[]> => page.evaluate(() => (window as any).__rikkun.house.architects());

/** 建築士さんが 読みこまれるまで 少し 進めて（上限 max ステップ）、一覧を 返す */
export function waitArchitects(page: Page, max = 30): Promise<Architect[]> {
  return page.evaluate((max) => {
    const h = (window as any).__rikkun;
    for (let n = 0; n < max && h.house.architects().length === 0; n++) h.step(1);
    return h.house.architects();
  }, max);
}

export const menuState = (page: Page): Promise<MenuState> => page.evaluate(() => (window as any).__rikkun.house.menu());
export const kura = (page: Page): Promise<Record<string, number>> => page.evaluate(() => (window as any).__rikkun.house.kura());
export const countOf = (page: Page, item: string): Promise<number> => page.evaluate((i) => (window as any).__rikkun.inventory.count(i), item);

/** ゲームの 時計（何日目か ＋ 1 日の 何 tick 目か）。メニュー・くら・エディターが 開いて いる 間は 止まる（AC41） */
export const clockOf = (page: Page): Promise<{ day: number; dayTick: number }> =>
  page.evaluate(() => {
    const t = (window as any).__rikkun.time.get();
    return { day: t.day as number, dayTick: t.dayTick as number };
  });

/** 持ち物の ふで（何本でも）の のこりの たいきゅう { max, left } を、持ち物の 並びの 順に。ふでが なければ 空 */
export const fudeLeft = (page: Page): Promise<{ max: number; left: number }[]> =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    const out: { max: number; left: number }[] = [];
    h.inventory.get().slots.forEach((s: { item: string } | null, i: number) => {
      if (s?.item === 'fude') out.push(h.inventory.durability(i) ?? { max: 0, left: 0 });
    });
    return out;
  });

/** メニューの ボタンを 押す（hook）。2 ステップ 進めてから メニューの 状態を 返す */
export function press(page: Page, id: string, arg?: unknown): Promise<MenuState> {
  return page.evaluate(
    ({ id, arg }) => {
      const h = (window as any).__rikkun;
      h.house.press(id, arg);
      h.step(2);
      return h.house.menu();
    },
    { id, arg },
  );
}

/**
 * 画面の 要素を 押して 2 ステップ 進める（画面の 更新は ステップで 進む）。
 * クリックは 見つかる・押せる ように なるまで テストの 時間いっぱい 待ち続ける ので、先に 見えて いるか・押せるか 確かめて、だめなら すぐ 落とす（what = 何を 押す はずか）。
 */
export async function clickUi(page: Page, locator: Locator, what?: string): Promise<void> {
  await expect(locator.first(), `押す 物が 画面に 見えない: ${what ?? String(locator)}`).toBeVisible();
  // 押せない（disabled か aria-disabled）ボタンは click() が 押せる ように なるまで 待ち続ける ので、先に 確かめて すぐ 落とす
  await expect(locator.first(), `押す 物が 押せない（disabled）: ${what ?? String(locator)}`).toBeEnabled();
  await locator.click();
  await stepUi(page);
}

/** 建築士さん a の 2 マス 南の 平らな 地面に 立つ（足場の 石の 床を 敷き、目の 前の 草花・はっぱを 空気に する）。向きは 北（−z） */
export async function standNear(page: Page, a: Pick<Architect, 'x' | 'z'>): Promise<void> {
  await page.evaluate(({ x, z }) => {
    const h = (window as any).__rikkun;
    const gy: number = h.world.groundHeight(Math.floor(x), Math.floor(z));
    const x0 = Math.floor(x) - 4;
    const x1 = Math.floor(x) + 4;
    const z0 = Math.floor(z) - 4;
    const z1 = Math.floor(z) + 4;
    h.world.fill(x0, gy, z0, x1, gy, z1, 'stone');
    h.world.fill(x0, gy + 1, z0, x1, gy + 4, z1, 'air');
    h.player.set({ position: { x, y: gy + 1, z: z + 2 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
    h.step(2);
  }, a);
}

/**
 * 建築士さんの 2 マス 南に 立って、からだの まん中（足もとから 0.5 マス 上）を ねらう（窓口 `__aim.sOffset` の 肩の 点 S から くりかえして 求める。
 * `__aim.solve` と 同じ 式を ブロックの まん中でなく 実際の 位置に 使う）。右クリックは 呼ぶ ほうが 押す。
 */
export async function aimAtArchitect(page: Page, id: Architect['id']): Promise<void> {
  const a = (await architects(page)).find((x) => x.id === id);
  if (!a) throw new Error(`建築士さん ${String(id)} が 読みこまれて いない`);
  await standNear(page, a);
  await page.evaluate((id) => {
    const h = (window as any).__rikkun;
    const aim = (window as any).__aim;
    const a = h.house.architects().find((x: any) => x.id === id);
    const p = h.player.get().position;
    const t = { x: a.x as number, y: (a.y as number) + 0.5, z: a.z as number };
    let yaw = 0;
    let pitch = 0;
    for (let i = 0; i < 8; i++) {
      const o = aim.sOffset(yaw, pitch);
      const dx = t.x - (p.x + o.dx);
      const dy = t.y - (p.y + o.dy);
      const dz = t.z - (p.z + o.dz);
      yaw = (Math.atan2(dx, -dz) * 180) / Math.PI;
      pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    }
    h.player.set({ yaw, pitch });
    h.step(1);
  }, id);
}

export interface Talked {
  /** 話しはじめてから メニューが 開くまでの ステップ（うなずき ＋ ふきだし。記録だけ） */
  steps: number;
  /** メニューが 開いた あと 3 ステップ 進めた ときの 状態 */
  menu: MenuState;
  /** 話しはじめてから メニューが 開いた あと 3 ステップまでに 鳴った 効果音の 名前 */
  sfx: string[];
  /**
   * menu().open が はじめて true に なった ステップの 状態: ボタンの id の 並びと、持ち物の 道具の 数（ふでは #339 から）。
   * 約束どおりなら、open が true の とき ボタンは そろって いて、はじめての 道具は もう わたして ある。開かなければ null
   */
  atOpen: { buttons: string[]; mizumori: number; dotsuki: number; fude: number } | null;
}

/**
 * 建築士さんに 話す。
 *   via 'rightClick': 2 マス 南から ねらって 右クリック（押して はなす）。入力の 道を 通す
 *   via 'hook'      : 近くに 立って house.talk(id)（右クリックと 同じ。準備用）
 * そのあと メニューが 開くまで 1 ステップずつ 進めて（うなずきを 待つ。上限 max）、音の 名前を ためる。
 */
export async function talkTo(page: Page, id: Architect['id'], via: 'rightClick' | 'hook', max = 300): Promise<Talked> {
  if (via === 'rightClick') {
    await aimAtArchitect(page, id);
  } else {
    const a = (await architects(page)).find((x) => x.id === id);
    if (!a) throw new Error(`建築士さん ${String(id)} が 読みこまれて いない`);
    await standNear(page, a);
  }
  return page.evaluate(
    ({ id, via, max }) => {
      const h = (window as any).__rikkun;
      h.lock.simulate(true); // 遊んでいる（ロック中）。メニューを とじた あとの 右クリックの ため
      const sfx: string[] = [];
      const drain = () => {
        for (const r of h.audio.sfx()) sfx.push(String(r.name));
      };
      h.audio.sfx(); // 話す 前の 音は すてる（前の 話の 声が 今回の 数に 入らない ように、記録を 空に する）
      const seen: { at: { buttons: string[]; mizumori: number; dotsuki: number; fude: number } | null } = { at: null };
      const look = () => {
        if (seen.at || !h.house.menu().open) return;
        seen.at = {
          buttons: h.house.menu().buttons.map((b: { id: string }) => b.id),
          mizumori: h.inventory.count('mizumori'),
          dotsuki: h.inventory.count('dotsuki'),
          fude: h.inventory.count('fude'),
        };
      };
      let steps = 0;
      if (via === 'hook') {
        h.house.talk(id);
        look();
      } else {
        h.input.release('secondary');
        h.input.press('secondary');
        h.step(1);
        steps++;
        drain();
        look();
        h.input.release('secondary');
      }
      while (!seen.at && steps < max) {
        h.step(1);
        steps++;
        drain();
        look();
      }
      for (let i = 0; i < 3; i++) {
        h.step(1);
        drain();
      }
      return { steps, menu: h.house.menu(), sfx, atOpen: seen.at };
    },
    { id, via, max },
  );
}

/** 声の 効果音の 数 */
export const voiceCount = (names: string[]): number => names.filter((n) => VOICE.test(n)).length;

/**
 * 上の メニューの 画面（DOM）が menu() と 食いちがう ところ（空 = 同じ）:
 * ボタンの 並び・押せるか（disabled / aria-disabled）・ふきだしの 字。ふきだしは 画面の どこに あっても よい（house-menu の 中でなくて よい）。
 */
export async function menuMismatch(page: Page): Promise<string[]> {
  await waitAnimationsDone(page); // 開く・ぴょこんの 動きの 途中で 見えているか を 決めない
  return page.evaluate(
    ({ root, bubble, prefix }) => {
      const h = (window as any).__rikkun;
      const m = h.house.menu();
      const out: string[] = [];
      const rootEl = document.querySelector(`[data-testid="${root}"]`);
      if (!rootEl) return [`画面に ${root} が ない`];
      const shown = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      };
      const dom = Array.from(rootEl.querySelectorAll(`[data-testid^="${prefix}"]`))
        .filter(shown)
        .map((el) => ({
          id: (el.getAttribute('data-testid') ?? '').slice(prefix.length),
          enabled: !((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true'),
        }));
      if (JSON.stringify(dom.map((d) => d.id)) !== JSON.stringify(m.buttons.map((b: { id: string }) => b.id))) {
        out.push(`ボタンの 並びが ちがう: 画面 ${dom.map((d) => d.id).join(',')} / menu() ${m.buttons.map((b: { id: string }) => b.id).join(',')}`);
      } else {
        m.buttons.forEach((b: { id: string; enabled: boolean }, i: number) => {
          if (dom[i]!.enabled !== b.enabled) out.push(`${b.id}: 押せるか ちがう（画面 ${dom[i]!.enabled} / menu() ${b.enabled}）`);
        });
      }
      const bubbleEl = document.querySelector(`[data-testid="${bubble}"]`);
      if (!bubbleEl) {
        out.push(`画面に ${bubble} が ない`);
      } else {
        // ふりがな（rt）は 数えない。字が 1 字ずつ 出る 作りでも 前から 同じなら 同じと みなす
        const clone = bubbleEl.cloneNode(true) as Element;
        clone.querySelectorAll('rt, rp').forEach((n) => n.remove());
        const shown = (clone.textContent ?? '').replace(/\s+/g, '');
        const said = String(m.bubble).replace(/\s+/g, '');
        if (!shown) out.push('ふきだしの 字が 空');
        else if (!(said.startsWith(shown) || shown.startsWith(said))) out.push(`ふきだしの 字が ちがう: 画面「${shown}」/ menu()「${said}」`);
      }
      return out;
    },
    { root: TID.menu, bubble: TID.bubble, prefix: 'house-btn-' },
  );
}

/** 画面の 外わく（セレクタ）の 中の HTML（ふりがなの 漢字しらべ 用） */
export const htmlOf = (page: Page, id: string): Promise<string> => page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.innerHTML ?? '', id);

/** 持ち物を 決めた 物だけに する（clear → add）。選ぶのは 先頭 */
export async function setBag(page: Page, items: Record<string, number>): Promise<void> {
  await page.evaluate((items) => {
    const h = (window as any).__rikkun;
    h.inventory.clear();
    for (const [item, n] of Object.entries(items)) h.inventory.add(item, n);
    h.step(1);
  }, items);
}

// ---------------------------------------------------------------- ほかの 建築士さんを さがす（AC5 の 2 人目）

/** 区画の 大きさ（AC2）。輪の 読みこみ 半径は 8 列（128 マス）なので、この 間かくの 点を まわれば 世界を おおう */
const REGION = 192;

/**
 * 最初の 1 人 いがいの 建築士さんを さがす。読みこまれて いれば それ。なければ スタートから 区画の 大きさ ごとの 点
 * （ちかい 順に 24 か所まで）へ teleport して、そろうまで 待って 窓口に 聞く。見つからなければ 落ちる。
 * （窓口 `architects()` は 読みこまれて いる 建築士さんだけ。シードで 決まる 場所を 先に 聞く 口は 仕様 §6.1 に ない）
 */
export async function findOtherArchitect(page: Page): Promise<Architect> {
  const near = (await architects(page)).find((a) => !a.first);
  if (near) return near;
  const sp = await spawnPoint(page);
  const spots: [number, number][] = [];
  for (let r = 1; r <= 3; r++) {
    const ring: [number, number][] = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r) ring.push([dx, dz]);
    ring.sort((p, q) => Math.hypot(...p) - Math.hypot(...q));
    spots.push(...ring);
  }
  const tried: string[] = [];
  for (const [dx, dz] of spots.slice(0, 24)) {
    const x = Math.round(sp.x + dx * REGION);
    const z = Math.round(sp.z + dz * REGION);
    tried.push(`(${x}, ${z})`);
    await page.evaluate(
      async ({ x, z }) => {
        const h = (window as any).__rikkun;
        h.world.teleport(x, z);
        // settle() は 時間切れ（maxFrames）でも 例外を 出さず 返す。読みこみが おわって いないのに「いない」と 見まちがえて 次の 点へ 進まない
        const s = await h.world.settle({ full: true });
        if (!s.ready || s.queued > 0 || s.columns.loading > 0) {
          throw new Error(`(${x}, ${z}) の 読みこみが おわらない（ready=${s.ready} queued=${s.queued} loading=${s.columns.loading}）。建築士さんが「いない」と 見まちがえない ために 落とす`);
        }
        h.step(5);
      },
      { x, z },
    );
    const other = (await architects(page)).find((a) => !a.first);
    if (other) return other;
  }
  throw new Error(`最初の 1 人の ほかの 建築士さんが 見つからない（まわった 点: ${tried.join(' ')}）。シードで 決まる 場所を 聞く 窓口が いるかも`);
}

// ---------------------------------------------------------------- UI 検査（AC35）

export interface HouseIssue {
  kind: string;
  target: string;
  detail: string;
}

/**
 * AC35 の 数: 外わく（セレクタ。いくつでも）の 中の 字は 24 px 以上（ふりがな rt は のぞく）、押せる 物は 48 px 以上。
 * 押せる 物 = <button>・role="button"・house-btn-*・kura-（kura-count の ほか。持ち物と くらの マス・数の えらび・あずける・とりだす）。
 * 拡大・縮小の 動き（ぴょこん）の 途中で はからない ように、動きが おわるのを 待ってから はかる。
 * UI 検査の 画面ごと・大きさごとに 呼ぶ（e2e/ui-gate.spec.ts の Screen.extra）。見つけた くずれの 一覧（空 = 合格）。
 */
export async function houseUiIssues(page: Page, rootSels: string[]): Promise<HouseIssue[]> {
  const found: HouseIssue[] = [];
  for (const rootSel of rootSels) {
    await waitAnimationsDone(page, rootSel);
    found.push(...(await rootIssues(page, rootSel)));
  }
  return found;
}

function rootIssues(page: Page, rootSel: string): Promise<HouseIssue[]> {
  return page.evaluate(({ rootSel, countTid }) => {
    const out: { kind: string; target: string; detail: string }[] = [];
    const root = document.querySelector(rootSel);
    if (!root) return out;
    const label = (el: Element): string => {
      const cls = Array.from(el.classList).slice(0, 3);
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls.length ? '.' + cls.join('.') : ''}`;
    };
    const visible = (el: Element): boolean => {
      for (let p: Element | null = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden' || (p as HTMLElement).hidden || parseFloat(cs.opacity) <= 0.01) return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
      if (!visible(el)) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'rt' || el.closest('rt')) continue;
      let text = '';
      for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) text += n.textContent ?? '';
      text = text.replace(/\s+/g, ' ').trim();
      if (text) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 23.95) out.push({ kind: 'font24', target: `${label(el)}「${text.slice(0, 16)}」`, detail: `字が ${fs}px（24px 以上）` });
      }
      const tapTid = el.getAttribute('data-testid') ?? '';
      const pressable =
        tag === 'button' || el.getAttribute('role') === 'button' || tapTid.startsWith('house-btn-') || (tapTid.startsWith('kura-') && tapTid !== countTid);
      if (pressable) {
        const r = el.getBoundingClientRect();
        if (r.width < 47.5 || r.height < 47.5) {
          out.push({ kind: 'tap48', target: `${label(el)}${text ? `「${text.slice(0, 16)}」` : ''}`, detail: `押せる 大きさが ${r.width.toFixed(0)}×${r.height.toFixed(0)}px（48px 以上）` });
        }
      }
    }
    return out;
  }, { rootSel, countTid: TID.count });
}

/**
 * くらを「今の 登録表の 最大」にする: 重ねられる アイテムの 種類を ぜんぶ 1 種ずつ あずけ（登録表から 数える。数は 決め打ちしない）、
 * 先頭の 1 種は 999 まで。持ち物は 重ねられる 物で 36 マスまで うめる。重ねられる 種類の 数と、くらに 入った 種類の 数を 返す。
 * 今の 登録表では 仕様 §3.2 の「100 種 以上 → スクロール」には とどかない。スクロールの 見張りは 実装側（CSS・ユニット）か オーナー確認。
 */
export function fillKuraAndBag(page: Page): Promise<{ stackable: number; kinds: number }> {
  return page.evaluate(() => {
    const h = (window as any).__rikkun;
    const stackable: { id: string; maxStack: number }[] = h.inventory.itemTypes().filter((t: { maxStack: number }) => t.maxStack >= 2);
    for (const t of stackable) {
      h.inventory.clear();
      h.inventory.add(t.id, Math.min(t.maxStack, 64));
      h.house.deposit(t.id, 999);
    }
    const top = stackable[0]!;
    const rounds = Math.ceil(999 / top.maxStack) + 1; // 1 回に 1 マス（maxStack こ）ずつ あずけて、999 を こえるまで
    for (let i = 0; i < rounds; i++) {
      h.inventory.clear();
      h.inventory.add(top.id, top.maxStack);
      h.house.deposit(top.id, 999);
    }
    h.inventory.clear();
    stackable.slice(0, 36).forEach((t, i) => h.inventory.setSlot(i, { item: t.id, count: Math.min(t.maxStack, 64) }));
    h.step(2);
    return { stackable: stackable.length, kinds: Object.keys(h.house.kura()).length };
  });
}

/** UI 検査の 画面「メニュー」: 道具を なくして 2 回目に 話す（ボタンが 6 つ ぜんぶ 出る いちばん 多い とき） */
export async function openMenuScreen(page: Page): Promise<void> {
  await openHouse(page);
  const first = (await waitArchitects(page)).find((a) => a.first)!;
  await talkTo(page, first.id, 'hook'); // はじめて: 道具を もらう
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.house.press('close');
    h.step(2);
    h.inventory.clear();
    h.step(1);
  });
  const t = await talkTo(page, first.id, 'hook');
  expect(t.menu.buttons.map((b) => b.id), 'ボタン 6 つ（道具が ないので「どうぐを もらう」も 出る）').toEqual([...BTN_ORDER]);
}

/**
 * UI 検査の 画面「くら」: くらは 重ねられる 物 ぜんぶ（今の 登録表の 最大）、持ち物は いっぱい。持ち物の 先頭の マスを えらんで 数の えらびを 出す。
 * 全種類の 名前が 出る ので、ふりがなの ない 漢字（間欠泉の つち など）も ここで 見る。
 */
export async function openKuraScreen(page: Page): Promise<void> {
  await openHouse(page);
  const first = (await waitArchitects(page)).find((a) => a.first)!;
  await talkTo(page, first.id, 'hook');
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.house.press('close');
    h.step(2);
  });
  const { stackable, kinds } = await fillKuraAndBag(page);
  expect(kinds, '重ねられる 物は 種類が いくつ あっても ぜんぶ くらに 入る（AC6）').toBe(stackable);
  await talkTo(page, first.id, 'hook');
  await press(page, 'kura');
  expect((await menuState(page)).page).toBe('kura');
  await clickUi(page, tid(page, TID.bag).first());
  expect(findUnrubiedKanji(await htmlOf(page, TID.kura)), 'ふりがなの ない 漢字（くら・重ねられる 物 ぜんぶ）').toEqual([]);
}
