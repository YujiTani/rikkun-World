// START-1: スタートメニューの 動き（画面の しくみ。DOM に よらない 状態の 機械。仕様 §2・§4・§5。T6）。
// 画面（startMenu.ts）は state() を 見て 描き、押された ものを press / key で 渡すだけ。
import { decideChar, saveChar, type CharMode } from '../char/charPref';
import type { StrengthLevel } from '../yokai/stats';
import { strengthFromUrl } from '../yokai/strengthPref';
import { saveLastSeed } from './lastWorld';
import { appendSeedDigit, backspaceSeed, randomSeed, seedFromText, seedTextFromUrl } from './seedInput';
import { decideWeight, saveWeight, type Weight } from './weightPref';

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StartChoice {
  kind: 'continue' | 'new';
  seed: number;
  strength: StrengthLevel;
  char: CharMode;
  weight: Weight;
}

export interface StartModelDeps {
  search: string;
  store: Store | null;
  findContinue(): Promise<{ seed: number; strength: StrengthLevel } | null>;
  findSaved(seed: number): Promise<{ strength: StrengthLevel } | null>;
  random(): number;
  sound(name: 'tab' | 'dry' | 'sparkle'): void;
  shake(): void;
  begin(choice: StartChoice): void;
  /** 状態が かわった とき（画面を 描きなおす） */
  onChange?(): void;
}

export type StartButton =
  | 'continue' | 'new' | 'back' | 'go' | 'random'
  | 'char-girl' | 'char-boy'
  | 'weight-light' | 'weight-normal' | 'weight-fine'
  | 'strength-easy' | 'strength-normal' | 'strength-hard'
  | 'key-0' | 'key-1' | 'key-2' | 'key-3' | 'key-4' | 'key-5' | 'key-6' | 'key-7' | 'key-8' | 'key-9' | 'key-back';

export interface StartViewState {
  screen: 'menu' | 'new';
  checking: boolean;
  continue: { seed: number; strength: StrengthLevel } | null;
  focus: 'continue' | 'new';
  seedText: string;
  existing: boolean;
  existingChecking: boolean;
  strength: StrengthLevel;
  strengthLocked: boolean;
  char: CharMode;
  charRow: boolean;
  weight: Weight;
  started: boolean;
}

export interface StartModel {
  press(button: StartButton): void;
  key(key: string): void;
  state(): StartViewState;
}

export function createStartModel(deps: StartModelDeps): StartModel {
  const nosave = new URLSearchParams(deps.search).get('nosave') === '1';
  const store = nosave ? null : deps.store;

  let screen: 'menu' | 'new' = 'menu';
  let checking = true;
  let cont: { seed: number; strength: StrengthLevel } | null = null;
  let focus: 'continue' | 'new' = 'new';
  let touched = false;
  let seedText = seedTextFromUrl(deps.search);
  let existingStrength: StrengthLevel | null = null;
  let existingChecking = false;
  let chosenStrength: StrengthLevel = strengthFromUrl(deps.search) ?? 'normal';
  let char: CharMode = decideChar(deps.search, store);
  let weight: Weight = decideWeight(deps.search, store);
  let started = false;
  let seedToken = 0;

  const changed = (): void => deps.onChange?.();

  function checkExisting(): void {
    const token = ++seedToken;
    existingStrength = null;
    existingChecking = true;
    deps
      .findSaved(seedFromText(seedText))
      .catch(() => null)
      .then((r) => {
        if (token !== seedToken) return; // 古い 返事は 捨てる
        existingChecking = false;
        existingStrength = r ? r.strength : null;
        changed();
      });
  }

  deps
    .findContinue()
    .catch(() => null)
    .then((r) => {
      checking = false;
      cont = r;
      if (r && !touched && !started) focus = 'continue';
      changed();
    });
  checkExisting();

  const strengthNow = (): StrengthLevel => (existingStrength ?? chosenStrength);

  function begin(kind: 'continue' | 'new', seed: number, strength: StrengthLevel): void {
    started = true;
    deps.sound('sparkle');
    saveLastSeed(store, seed);
    changed();
    deps.begin({ kind, seed, strength, char, weight });
  }

  function addDigit(d: string): void {
    const r = appendSeedDigit(seedText, d);
    if (r.rejected) {
      deps.sound('dry');
      deps.shake();
      return;
    }
    deps.sound('tab');
    seedText = r.text;
    checkExisting();
    changed();
  }

  function go(): void {
    if (existingChecking) {
      deps.sound('dry');
      return;
    }
    begin('new', seedFromText(seedText), strengthNow());
  }

  function press(b: StartButton): void {
    if (started) return;
    touched = true;
    if (b.startsWith('key-')) {
      if (screen !== 'new') return;
      if (b === 'key-back') {
        const next = backspaceSeed(seedText);
        deps.sound('tab');
        if (next !== seedText) {
          seedText = next;
          checkExisting();
        }
        changed();
      } else addDigit(b.slice(4));
      return;
    }
    switch (b) {
      case 'continue':
        if (screen !== 'menu') return;
        if (checking || !cont) {
          deps.sound('dry');
          return;
        }
        begin('continue', cont.seed, cont.strength);
        return;
      case 'new':
        if (screen !== 'menu') return;
        deps.sound('tab');
        screen = 'new';
        break;
      case 'back':
        if (screen !== 'new') return;
        deps.sound('tab');
        screen = 'menu';
        break;
      case 'go':
        if (screen !== 'new') return;
        go();
        return;
      case 'random':
        if (screen !== 'new') return;
        deps.sound('tab');
        seedText = String(randomSeed(deps.random));
        checkExisting();
        break;
      case 'char-girl':
      case 'char-boy': {
        if (screen !== 'menu' || char === 'block') return;
        deps.sound('tab');
        char = b === 'char-girl' ? 'girl' : 'boy';
        saveChar(store, char);
        break;
      }
      case 'weight-light':
      case 'weight-normal':
      case 'weight-fine':
        if (screen !== 'menu') return;
        deps.sound('tab');
        weight = b.slice(7) as Weight;
        saveWeight(store, weight);
        break;
      case 'strength-easy':
      case 'strength-normal':
      case 'strength-hard':
        if (screen !== 'new') return;
        if (existingStrength !== null) {
          deps.sound('dry');
          return;
        }
        deps.sound('tab');
        chosenStrength = b.slice(9) as StrengthLevel;
        break;
    }
    changed();
  }

  function key(k: string): void {
    if (started) return;
    if (screen === 'menu') {
      if (k !== 'Enter' || checking) return; // 調べている あいだは Enter が きかない
      press(focus === 'continue' && cont ? 'continue' : 'new');
      return;
    }
    if (/^[0-9]$/.test(k)) press(`key-${k}` as StartButton);
    else if (k === 'Backspace') press('key-back');
    else if (k === 'Escape') press('back');
    else if (k === 'Enter') press('go');
  }

  return {
    press,
    key,
    state: () => ({
      screen,
      checking,
      continue: cont,
      focus,
      seedText,
      existing: existingStrength !== null,
      existingChecking,
      strength: strengthNow(),
      strengthLocked: existingStrength !== null,
      char,
      charRow: char !== 'block',
      weight,
      started,
    }),
  };
}
