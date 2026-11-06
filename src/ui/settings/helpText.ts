/**
 * せってい画面の「ヘルプの帯」の文（SETTINGS-1）。カーソルを当てたとき・フォーカスしたときに 1 か所に出す。
 * 子ども向け: ひらがな・カタカナ（漢字を入れるときは ruby()）。1 か所の表にまとめる。
 */
import type { Action } from '../../input/actions';

/** 画面・タブ・ボタンの説明。data-help の値がこの名前 */
export const UI_HELP = {
  // 1 だん目
  tabSound: 'ゲームの なかで ながれる おとの おおきさを きめるよ',
  tabCamera: 'カメラの うごく スピードを きめるよ',
  tabControls: 'ゲームの そうさの しかたを きめるよ',
  // 2 だん目
  tabKeys: 'キーボードと マウスを つかって あそぶ ときの そうさの しかただよ',
  tabPad: 'ゲームパッドを つかって あそべるよ。ボタンは じぶんの すきに かえられるよ',
  tabUse: '1P と 2P が つかう コントローラーを きめるよ。えらんだら その コントローラーの ＋を おしてね',
  useRowP1: '1P が つかう コントローラーを えらぶよ。キーボードと マウスは いつも 1P だよ',
  useRowP2: '2P が つかう コントローラーを えらぶよ',
  useDecided: 'きまったよ！',
  useSwapped: '1P と 2P を いれかえたよ',
  useTimeout: 'じかんぎれ。もういちど えらんでね',
  useNone: 'コントローラーを つないで、ボタンを おしてね。おすと ここに でてくるよ',
  useIdle: 'コントローラーの ボタンを おすと ひかるよ。えらんだら ＋を おしてね', // ふだんの 帯。1024 幅でも 1 行に 入れる（2 行だと 帯の たかさが かわって パネルが ずれる）
  useLitHint: 'ボタンを おすと その コントローラーが ひかるよ',
  // 3 だん目
  tabField: 'ゲームの なかで あそんでいる ときの ボタンだよ。ふだを おすと ボタンを かえられるよ',
  tabMenu: 'もちもの・クラフトの がめんを ひらいている ときの ボタンだよ。ここでは かえられないよ',
  // 音
  mute: 'チェックを いれると、ゲームの おとが ぜんぶ きえるよ',
  volMaster: 'ぜんぶの おとの おおきさを きめるよ。みぎに うごかすと おおきくなるよ',
  volBgm: 'ながれている おんがくの おおきさを きめるよ',
  volFx: 'ブロックを ほる ときなどの おとの おおきさを きめるよ',
  // カメラ・そのほか
  lookSpeed: 'みぎスティックを たおした ときに カメラが うごく はやさを きめるよ',
  lookReset: 'カメラの はやさを はじめの はやさに もどすよ',
  toCamera: 'カメラの はやさを きめる がめんに いくよ',
  resetBinds: 'ボタンを ぜんぶ はじめの ならびに もどすよ',
  diag: 'コントローラーが ちゃんと つながっているか しらべるよ',
  deadZone: 'スティックを すこし たおしても うごかない ところの おおきさを きめるよ',
  calib: 'いまの スティックの いちを まんなかとして おぼえるよ',
  cancel: 'ボタンを かえるのを やめるよ',
  back: 'ひとつ まえの がめんに もどるよ',
  close: 'せっていを とじて ゲームに もどるよ',
  // スタートメニュー
  startPlay: 'ゲームを はじめるよ',
  startBook: 'あそびかたを よむよ',
  startSettings: 'おとや カメラ、ボタンを かえる せっていの がめんを ひらくよ',
  startTitle: 'タイトルの がめんに もどるよ',
  // もちもの・クラフトの ボタン（見るだけ）
  menuDpad: 'メニューの なかで、えらぶ ものを うごかすよ',
  menuOk: 'えらんだ ものを きめるよ',
  menuBack: 'ひとつ もどるよ。メニューを とじるよ',
  menuStart: 'スタートメニューを ひらくよ',
  // スティック（かえられない）
  stickL: 'ひだりスティックを たおすと、そのほうこうに あるくよ。ここは かえられないよ',
  stickR: 'みぎスティックを たおすと、カメラが うごくよ。ここは かえられないよ',
} as const;


/** そうさごとの「何ができるか」。ボタンの札を おしたときの 説明のもと */
export const ACTION_HELP = {
  jump: 'ジャンプを するよ',
  run: 'はやく はしるよ',
  toggleView: 'カメラの みえかたを きりかえるよ',
  primary: 'ブロックを ほったり、こうげきを したりするよ',
  secondary: 'ブロックを おいたり、ものを たべたりするよ',
  hotbarPrev: 'ひとつ まえの てにもつに きりかえるよ',
  hotbarNext: 'ひとつ あとの てにもつに きりかえるよ',
  toggleInventory: 'もちものと クラフトの がめんを ひらくよ',
  openStartMenu: 'スタートメニューを ひらくよ',
  openLog: 'さいきんの できごとを みるよ',
  drop: 'もっている ものを 1こ すてるよ',
  dropStack: 'もっている ものを まとめて すてるよ',
} as const satisfies Partial<Record<Action, string>>;

export const REBIND_HINT = 'おすと ボタンを かえられるよ';

export function actionHelp(action: Action): string {
  const text = (ACTION_HELP as Partial<Record<Action, string>>)[action];
  return text ? `${text}。${REBIND_HINT}` : REBIND_HINT;
}

/** data-help の値 → 文。`ui:<キー>` か `act:<そうさ>` */
export function helpFor(key: string): string {
  if (key.startsWith('act:')) return actionHelp(key.slice(4) as Action);
  const text = (UI_HELP as Record<string, string>)[key.replace(/^ui:/, '')];
  return text ?? '';
}
