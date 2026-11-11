import type { YakataSoundTable } from '../yakataSoundTable';

/**
 * ようかいの やかたの 音の 場面（MINE-1F §3.4 の 表・F16 ③）。純粋な 係: 1 ステップ ごとに `tick`、できごとは `event`、頼みは `drain` で 読む〔読むと 空〕。
 * 音を 鳴らす 所〔YakataSound・BGM の 口〕は この 頼みを 見て 動く。数〔時間・dB〕は `yakataSoundTable()` の 表だけ。
 *
 * 場面: none ＝ やかたの 音 なし / ambience ＝ ふんいき / waiting ＝ 挑戦が はじまって 挑戦の 曲が 入る 前〔ふんいきの まま〕/ challenge ＝ 挑戦の 曲。
 *  ・waiting・challenge の 間は たたかいの 曲に しない〔挑戦の 場面が 先〕。まけ・かち・とじた ときは 曲を endFadeSec で 消す。かなしい 曲は ない。
 *  ・ループが 鳴って いる 間は 効果音の 和音合わせを Dm に する。
 *  ・かち: 曲・ふんいきを 消す → 門が ひらく 音・ファンファーレ・もとの BGM → 宝箱の 音 → 実績の 音〔大きな 音は 1 つずつ ずらす。その 間 BGM は 小さく〕。
 */
export type YakataSceneName = 'none' | 'ambience' | 'waiting' | 'challenge';
export type YakataLoopId = 'yakataAmbience' | 'yakataChallenge';
export type YakataSceneEvent = 'start' | 'win' | 'lose' | 'close';

export interface YakataSceneInput {
  /** だれか 1 人でも 足が あやしい 横穴・大広間に ある〔かった あとの やかたは false〕 */
  present: boolean;
  /** 挑戦の 間 */
  chosen: boolean;
  /** かった あと */
  katta: boolean;
  /** ふつうの たたかいの 曲の 条件が 立って いる */
  battle: boolean;
}
export interface YakataSceneState {
  scene: YakataSceneName;
  fileLoops: { name: YakataLoopId; db: number }[];
  chord: 'Dm' | null;
  battleMusic: boolean;
  bgmDuck: boolean;
}
export type YakataSceneReq =
  | { kind: 'loop'; name: YakataLoopId; sec: number; db: number }
  | { kind: 'stop'; name: YakataLoopId; sec: number }
  | { kind: 'swap' | 'back'; name: 'bgm'; sec: number }
  | { kind: 'sfx'; name: 'yakataGateClose' | 'yakataGateOpen' | 'title' | 'fanfare' | 'chest' | 'achievement' };

export interface YakataScene {
  tick(i: YakataSceneInput): void;
  event(e: YakataSceneEvent): void;
  state(): YakataSceneState;
  drain(): YakataSceneReq[];
}

const STEPS_PER_SEC = 60;
const steps = (sec: number): number => Math.round(sec * STEPS_PER_SEC);

export function createYakataScene(T: YakataSoundTable): YakataScene {
  let scene: YakataSceneName = 'none';
  const loops = new Map<YakataLoopId, number>();
  let out: YakataSceneReq[] = [];
  let queued: YakataSceneEvent[] = [];
  /** 挑戦が はじまって からの ステップ（waiting の 間 数える） */
  let sinceStart = 0;
  /** 今の ステップ番号と、あとで 出す 頼み〔かち の 順〕 */
  let now = 0;
  const later: { at: number; req: YakataSceneReq; duck?: 'on' | 'off' }[] = [];
  /** おわって から もう 1 度 ふんいきに 入れる まで 〔ステップ〕 */
  let reenterAt = 0;
  let duck = false;
  let lastBattle = false;

  const stopAll = (): void => {
    for (const name of [...loops.keys()]) {
      out.push({ kind: 'stop', name, sec: T.endFadeSec });
      loops.delete(name);
    }
  };
  const startAmbience = (db: number, withSwap: boolean): void => {
    loops.set('yakataAmbience', db);
    out.push({ kind: 'loop', name: 'yakataAmbience', sec: T.swapSec, db });
    if (withSwap) out.push({ kind: 'swap', name: 'bgm', sec: T.swapSec });
  };

  function handle(e: YakataSceneEvent): void {
    if (e === 'start') {
      if (!loops.has('yakataAmbience')) startAmbience(0, true);
      scene = 'waiting';
      sinceStart = 0;
      out.push({ kind: 'sfx', name: 'yakataGateClose' }, { kind: 'sfx', name: 'title' });
      return;
    }
    const wasLoud = scene === 'waiting' || scene === 'challenge' || loops.size > 0;
    stopAll();
    scene = 'none';
    reenterAt = now + steps(T.endFadeSec) + 1;
    if (e === 'close') {
      if (wasLoud) out.push({ kind: 'back', name: 'bgm', sec: T.backSec });
      return;
    }
    // かち・まけ: 門が ひらく 音
    out.push({ kind: 'sfx', name: 'yakataGateOpen' });
    if (e === 'lose') {
      out.push({ kind: 'back', name: 'bgm', sec: T.backSec }); // BGM を 暗く しない・かなしい 曲は ない
      return;
    }
    // かち: ファンファーレ → 宝箱 → 実績。その 間 BGM は 小さく
    const chestAt = now + steps(T.chestAfterFanfareSec);
    const achAt = chestAt + steps(T.achievementAfterChestSec);
    out.push({ kind: 'sfx', name: 'fanfare' }, { kind: 'back', name: 'bgm', sec: T.backSec });
    duck = true;
    later.push({ at: chestAt, req: { kind: 'sfx', name: 'chest' } }, { at: achAt, req: { kind: 'sfx', name: 'achievement' }, duck: 'off' });
  }

  return {
    tick(i) {
      lastBattle = i.battle;
      for (const e of queued) handle(e);
      queued = [];
      for (let k = later.length - 1; k >= 0; k--) {
        const l = later[k]!;
        if (l.at > now) continue;
        out.push(l.req);
        if (l.duck === 'off') duck = false;
        later.splice(k, 1);
      }
      later.sort((a, b) => a.at - b.at);
      if (scene === 'waiting') {
        sinceStart++;
        if (sinceStart === steps(T.challengeDelaySec) + 1 && !loops.has('yakataChallenge')) {
          loops.set('yakataChallenge', 0);
          loops.set('yakataAmbience', T.ambienceUnderDb);
          out.push({ kind: 'loop', name: 'yakataChallenge', sec: T.challengeFadeSec, db: 0 }, { kind: 'loop', name: 'yakataAmbience', sec: T.challengeFadeSec, db: T.ambienceUnderDb });
          scene = 'challenge';
        }
      } else if (scene === 'none' && i.present && !i.katta && now >= reenterAt) {
        scene = 'ambience';
        startAmbience(0, true);
      } else if (scene === 'ambience' && !(i.present && !i.katta)) {
        stopAll();
        out.push({ kind: 'back', name: 'bgm', sec: T.backSec });
        scene = 'none';
      }
      now++;
    },
    event(e) {
      queued.push(e);
    },
    state() {
      const battling = scene === 'waiting' || scene === 'challenge';
      return {
        scene,
        fileLoops: [...loops].map(([name, db]) => ({ name, db })),
        chord: loops.size > 0 ? 'Dm' : null,
        battleMusic: !battling && lastBattle,
        bgmDuck: duck,
      };
    },
    drain() {
      const r = out;
      out = [];
      return r;
    },
  };
}
