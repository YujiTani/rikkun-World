export const DT = 1 / 60;
export const TAU = Math.PI * 2;
/** 妖怪 とは べつ の 乱数 の 流れ（シード に まぜる 数） */
export const RNG_SALT = 0x11fe0001;
/** なかま どうし の 中心 の 最小 すき間（PO 2026-10-18: 0.5 → 0.8。重なって 1 わ しか 見えない ため） */
export const FRIEND_MIN_GAP = 0.8;
/** 止まる 距離 の ばらつき（なかま に なった 順 で 0・0.5・1.0 を くり返す） */
export const STOP_STEP = 0.5;
export const STOP_KINDS = 3;
export const APPEAR_TICKS = 30;
export const EVENT_CAP = 512;
export const FALL_G = 25;
/** ハート 1 以上 の やせい が 消える 距離（§2.1。台帳 G4） */
export const HEART_REMOVE_DIST = 96;
/** ついてくる 時間 が 0 の なかま が はなれない はんい（§2.7） */
export const HOME_RADIUS = 6;
/** おなかいっぱい の 動き（§3.5） */
export const FULL_REACT_TICKS = 20;
/** おろす 動き（§3.5） */
export const PUT_DOWN_TICKS = 20;
/** あみ で とれた むし が 持ち物 に 入る まで。ふった ステップ を 1 と 数えて 30 ステップ 目（ふった あと の update は 29 回） */
export const BUG_CATCH_UPDATES = 29;
/** パタパタ と みなす 下向き の 速さ（マス/秒） */
export const FLUTTER_MIN_VY = 0.3;
/** なげる（LIVE-2.1 §2.2）: もちあげ ステップ・はなれる 高さ（足＋）・着地点 の まん中 の 高さ（足＋）・てっぺん の 余り・とぶ ステップ の 土台 と きょり ごと */
export const THROW_LIFT_TICKS = 10;
export const THROW_HAND_Y = 2.2;
export const THROW_LAND_Y = 2.0;
export const THROW_APEX_UP = 0.5;
export const THROW_BASE_TICKS = 20;
export const THROW_TICKS_PER_M = 5;
/** さく ごし の ねらい: さく に 入って から この きょり 以内 の 床 */
export const THROW_THROUGH = 4;
/** 何も ねらわない とき の 前 の きょり・下 へ 見る 高さ */
export const THROW_FRONT = 3;
export const THROW_SCAN_DOWN = 8;
/** d が これ より 近い とき は なげず に そっと おろす */
export const THROW_SOFT_DIST = 1;
/** さく の 上 に 着いた 子 を 中 へ よせる 速さ（0.5 マス / 12 ステップ） */
export const GLIDE_STEP = 0.5 / 12;
/** 小屋 の 子 に なった しゅんかん の 大きな しるし が 消える まで（ステップ） */
export const POP_TICKS = 40;

export const HATCH_TICKS = 60;
/** 1 台 で 次 の たまご が かえる まで の 間（前 の 子 の かえる 動き が おわって から。LIVE-2.1 §2.4） */
export const KIT_HATCH_GAP = 20;
/** こたつ の 天板 の 3 わく を 出す プレイヤー との 水平 の きょり */
export const KIT_ICON_DIST = 8;
export const HATCH_MACHO_TICKS = 80;
export const GROW_TICKS = 60;
/** 着地 の コロン（§2.9）と、コロン に なる 落ちた 高さ（これ より 低い 段差 では ころがらない） */
export const ROLL_TICKS = 12;
export const ROLL_MIN_DROP = 1.5;
/** 小屋 の ブロック が まだ ある か 見る 間かく（ステップ） */
export const COOP_CHECK_EVERY = 30;
/** 小屋 の 子 の 動ける はんい（中 3×3 の ふち から の よゆう） */
export const KID_MARGIN = 0.25;
/** こたつ の 友だち いっぱい の 合図 を くり返す 間（§2.1） */
export const FRIEND_FULL_REPEAT = 600;
/** こたつ の かえる 場所 が 無い とき の さがし直し */
export const SPOT_RETRY = 60;
export const BREED_SALT = 0x11fe0004;
export const GOLD_SALT = 0x11fe0005;
/** GOLD-1 §3.4: 合図 natsukiWait は 600 ステップ に 1 回 まで */
export const NATSUKI_HINT_GAP = 600;
export const BLOCK_NUKUNUKU = 'nukunuku';
/** LIVE-3 §2.4: ねぐら へ 歩く（この ステップ で 着く）・とびら が おりる 区間・一言 が 出る・とびら の 上下 の ながさ */
export const MEAT_WALK = 60;
export const MEAT_DOOR_FROM = 60;
export const MEAT_DOOR_TICKS = 20;
export const MEAT_SAY_AT = 80;
export const MEAT_SAY_FADE = 20;
/** ねぐら の 中: 小屋 の まん中 から うしろ へ この きょり（中 3×3 の 中。AC6 の「ねぐら の 中」） */
export const MEAT_NEST_DIST = 1.3;
export const NO_FIGHT: number[] = [];
export const ZERO_KNOCK = { dist: 0, up: 0 } as const;
