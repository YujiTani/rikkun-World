// START-1: 起動で スタートメニューを 出して、えらんだ 物（StartPlan）を 返す（仕様 §4.1・§4.6・§4.7）。
// メニューを 出さない（URL で 始める）ときも 同じ 形の StartPlan を 返す。窓口 start は どちらでも ある。
import type { CharMode } from '../char/charPref';
import type { PersistBackend } from '../save/backend';
import type { StrengthLevel } from '../yokai/stats';
import { RING_SMALL, type RingSpec } from '../world/stream/ring';
import { findContinue, findSavedWorld, saveLastSeed, SAVE_BOOT_TIMEOUT_MS } from './lastWorld';
import { mountStartMenu, type StartMenuView } from './startMenu';
import { shouldShowStartMenu } from './startMenuPolicy';
import { createStartModel, type StartChoice, type StartModel } from './startModel';
import { decideWeight, type Weight } from './weightPref';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 世界を 作る ときに 使う えらんだ 物 */
export interface StartPlan {
  from: 'menu' | 'url';
  seed: number;
  /** メニューで えらんだ つよさ（URL・保存が なければ これ。URL で 始めたときは null） */
  strength: StrengthLevel | null;
  /** メニューで えらんだ キャラ（URL で 始めたときは null = CHAR-5 の 決め方） */
  char: CharMode | null;
  weight: Weight;
  /** メニューの 画面を 消す（世界の 準備が はじまってから 呼ぶ） */
  close(): void;
}

export interface StartHookState {
  shown: boolean;
  screen: 'menu' | 'new' | null;
  continue: { seed: number; strength: StrengthLevel } | null;
  checking: boolean;
  seedText: string;
  existing: boolean;
  strength: StrengthLevel;
  char: CharMode;
  weight: Weight;
}

export interface StartInfo {
  from: 'menu' | 'url';
  seed: number;
  strength: StrengthLevel;
  weight: Weight;
  microR: number;
  ring: 'small' | 'full';
  shadowBuilt: boolean;
}

export interface StartHook {
  state(): StartHookState;
  info(): StartInfo | null;
}

export interface StartBoot {
  hook: StartHook;
  run(o: BootOptions): Promise<StartPlan>;
  /** 世界を 作ったあと: 窓口 info に 入れる */
  setInfo(o: { strength: StrengthLevel; microR: number; ring: RingSpec; shadowBuilt: boolean }): void;
}

export interface BootOptions {
  search: string;
  /** localStorage（使えない・?nosave=1 のとき null でも よい） */
  store: KeyValueStore | null;
  /** IndexedDB（開けない・返事なし は null） */
  db: Promise<PersistBackend | null>;
  envStartMenu: string | undefined;
  nSections: number;
  sound(name: 'tab' | 'dry' | 'sparkle'): void;
  /** URL で 始めるときの シード（readSeed） */
  readSeed(): number;
  random?: () => number;
}

export function createStartBoot(): StartBoot {
  let model: StartModel | null = null;
  let last: StartHookState | null = null;
  let plan: { from: 'menu' | 'url'; seed: number; weight: Weight } | null = null;
  let infoRest: { strength: StrengthLevel; microR: number; ring: RingSpec; shadowBuilt: boolean } | null = null;

  const snapshot = (m: StartModel): StartHookState => {
    const s = m.state();
    return { shown: true, screen: s.screen, continue: s.continue, checking: s.checking, seedText: s.seedText, existing: s.existing, strength: s.strength, char: s.char, weight: s.weight };
  };

  const hook: StartHook = {
    state: () => {
      if (model) return snapshot(model);
      return last ?? { shown: false, screen: null, continue: null, checking: false, seedText: '', existing: false, strength: 'normal', char: 'girl', weight: 'fine' };
    },
    info: () => (plan && infoRest ? { from: plan.from, seed: plan.seed, weight: plan.weight, strength: infoRest.strength, microR: infoRest.microR, ring: infoRest.ring === RING_SMALL ? 'small' : 'full', shadowBuilt: infoRest.shadowBuilt } : null),
  };

  async function run(o: BootOptions): Promise<StartPlan> {
    const nosave = new URLSearchParams(o.search).get('nosave') === '1';
    const store = nosave ? null : o.store;
    if (!shouldShowStartMenu(o.search, o.envStartMenu)) {
      const seed = o.readSeed();
      const weight = decideWeight(o.search, store);
      saveLastSeed(store, seed);
      plan = { from: 'url', seed, weight };
      return { from: 'url', seed, strength: null, char: null, weight, close() {} };
    }
    // 保存を 調べる（最長 3 秒。IndexedDB を 開く 時間も ふくむ）
    const timed = <T>(p: Promise<T>): Promise<T | null> =>
      Promise.race([p, new Promise<null>((ok) => setTimeout(() => ok(null), SAVE_BOOT_TIMEOUT_MS))]).catch(() => null);
    let view: StartMenuView | null = null;
    const chosen = new Promise<StartChoice>((resolve) => {
      model = createStartModel({
        search: o.search,
        store: o.store,
        findContinue: () => timed(o.db.then((db) => findContinue({ db, store, search: o.search, nSections: o.nSections }))),
        findSaved: (seed) => (nosave ? Promise.resolve(null) : timed(o.db.then((db) => findSavedWorld({ db, seed, nSections: o.nSections })))),
        random: o.random ?? Math.random,
        sound: o.sound,
        shake: () => view?.shake(),
        begin: resolve,
        onChange: () => view?.render(),
      });
      view = mountStartMenu(() => model!);
    });
    const choice = await chosen;
    plan = { from: 'menu', seed: choice.seed, weight: choice.weight };
    return {
      from: 'menu',
      seed: choice.seed,
      strength: choice.strength,
      char: choice.char,
      weight: choice.weight,
      close() {
        if (model) {
          last = { ...snapshot(model), shown: false, screen: null };
          model = null;
        }
        view?.close();
        view = null;
      },
    };
  }

  return {
    hook,
    run,
    setInfo(i) {
      infoRest = i;
    },
  };
}

