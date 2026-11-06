/**
 * COOP-1 作業 3d（AC72）: おとなの「よみこむ」（ファイルから 読み直す）の 流れ。
 * 型だけの スタブ（developer が 作って wire/save.ts の mountAdult.importSave に つなぐ。テストは src/duo/reloadLeave.test.ts）。
 */
export interface ImportFlow {
  /** 「いまの せかいが ファイルの ものに かわります。いいですか？」 */
  confirm(): boolean;
  /** 読みなおすまで、いまの 世界で ファイルの 中身を 上書きしない */
  suspendSave(): void;
  resumeSave(): void;
  idle(): Promise<void>;
  /** ファイルを 保存に 書く（`importSave` ＋ 保留の 掃除）。失敗したら 投げる */
  writeFile(): Promise<void>;
  /** 2P の あとしまつ（`DuoSession.leave('import')`。今の 2P の 持ち物は 保存に 書かない） */
  leaveDuo(reason: 'import'): void;
  reload(): void;
  alert(message: string): void;
}

export type ImportResult = 'reloaded' | 'declined' | 'failed';

export async function runImport(_f: ImportFlow): Promise<ImportResult> {
  throw new Error('COOP-1 3d: runImport は まだ ない');
}
