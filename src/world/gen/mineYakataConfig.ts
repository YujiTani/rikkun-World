import { YAKATA_BLOCKS } from '../blocks/mineYakata';
import { YAKATA_LIGHT } from '../light/yakataLight';

/**
 * ようかいの やかた（MINE-1F。docs/design/MINE-1F.md §4）の 数の 表。1 つの データは 1 か所（#304）。
 * 長さは マス・y は 足の マスの 高さ。【PO 案】の 数は オーナー確認①で 直して よい（テストは 窓口 `yakataTable()` から 読む）。
 * ゲームに 出た あとは `looks`・くじの 式〔mineYakataRoll.ts〕を かえない（かえると 保存した 列と 新しい 列で 組が まざる。§4.1・§4.9）。
 */
export type Look = 'maou' | 'otera';
export const LOOK_LIST: readonly Look[] = ['maou', 'otera'];
/** 出る 場所の 区分〔左・右・前〕 */
export type Zone = 'left' | 'right' | 'front';
export const ZONE_LIST: readonly Zone[] = ['left', 'right', 'front'];

export const YAKATA_TABLE = {
  /** やかたの くじに 当たる わりあい〔ふかい 1E の 坑道の 約 0.5 ÷ 置ける 割合 0.7。置けない 当たりが あるので 上げて、遊びの 数を 区画 約 19 に 1 つに 近づける。PO の 決め〕 */
  chance: 0.71,
  /** 見た目の くじ〔A「まおうの しろ」・B「よるの おてら」を 半分ずつ。合計 1〕 */
  looks: { maou: 0.5, otera: 0.5 } as Record<Look, number>,
  /** 組ごとの ブロック〔id を 書くのは src/world/blocks/mineYakata.ts 1 か所〕 */
  lookBlocks: YAKATA_BLOCKS as Record<Look, { kabe: string; yuka: string; dan: string; taimatsu: string }>,
  /** やかたの 中の 見え方〔数は 光の 表 `YAKATA_LIGHT` の まま〕: 光 from〜to〔段〕の 所を 明るさ shade〔0〜1〕より 暗く しない・妖怪の 体は foe〔0〜1〕より 暗く しない */
  dim: { ...YAKATA_LIGHT.dim },
  /** やかたの 中の 光の 色〔組ごと。数は 光の 表 `YAKATA_LIGHT` の まま〕 */
  lookTint: { maou: [...YAKATA_LIGHT.lookTint.maou], otera: [...YAKATA_LIGHT.lookTint.otera] } as Record<Look, [number, number, number]>,
  /** 二つ名の 数〔ひき〕: おやぶん・たいしょう・ヌシ（ヌシは なし） */
  oyabun: 5,
  taisho: 2,
  nushi: 0,
  /** あらわれて から 攻撃しない ステップ数〔1 秒〕 */
  graceSteps: 60,
  /** 出る 場所: 区分 1 つの 候補〔か所〕・区分 1 つから 出す 数の 下限〔ひき〕・宝箱からの きょり〔マス。以上・以下〕・候補どうしの はなれ〔マス〕・あけた 人からの はなれ〔マス。これより 遠い〕 */
  spawn: { perZone: 4, minPerZone: 2, fromChest: [6, 10] as [number, number], apart: 3, awayFromOpener: 4 },
  /** あやしい 横穴: はば・高さ〔マス〕・長さ〔マス。はんい〕・たいまつの 間かく〔マス〕 */
  passage: { width: 3, height: 4, length: [8, 16] as [number, number], torchEvery: 3 },
  /** 門: はば・高さ〔マス〕 */
  gate: { width: 3, height: 4 },
  /** 大広間: 床の 1 辺〔マス〕・空気の 高さ〔マス〕・柱の 数〔本〕 */
  hall: { size: 17, height: 7, pillars: 4 },
  /** 祭壇: 下の 段・上の 段の 大きさ〔長い ほう・みじかい ほう マス〕 */
  altar: { lower: [7, 5] as [number, number], upper: [5, 3] as [number, number] },
  /** あやしい たいまつ: やかた 1 つの 上限〔本〕 */
  maxTorches: 16,
  /** 大広間の 床・祭壇の 立てる マスの ブロックの 光の 下限〔段〕 */
  minLight: 2,
  /** 大広間の かべの 外がわの ふつうの いし〔マス〕 */
  ring: 2,
};
export type YakataTable = typeof YAKATA_TABLE;

/** つくりかたの 数〔テストには 見せない〕 */
export const YAKATA_TUNING = {
  /** 柱の 場所: 門がわから 数えて 〔マス。床の 奥ゆき s〕と 横〔マス。まん中から。2×2 の うち 道に 近い ほう〕 */
  pillarFront: 5,
  pillarBack: 10,
  pillarSide: 4,
  /** 門がわの たいまつの 横〔マス。大広間の まん中から〕 */
  torchGateSide: 4,
  /** 祭壇の ならび: 門がわから 数えて 下の 段が はじまる 奥ゆき s〔大広間の いちばん おくの かべに ぴったり〕 */
  altarGap: 0,
  /** やかたの 口と ほかの 口の あいだ〔マス。以上。仕様 §4.2〕 */
  mouthGap: 6,
  /** いけ・岩山・洞くつの 口を さける のは 天井の 上の 石が この 数〔マス〕より うすい ときだけ */
  specialDepth: 10,
  /** 出る 場所を 区分ごとに そろえる ために 引きなおす 回数 */
  spawnTries: 80,
  /** 口の 柱の 高さ〔マス〕 */
  mouthPillar: 4,
  /** 宝箱の くじの 乱数の もと〔世界の シードに かけ合わせる。やかたの くじ・見た目の くじ・7 ひきと べつの 流れ〕 */
  tags: { hit: 841, look: 842, plan: 843, foes: 844, spots: 845 },
} as const;
