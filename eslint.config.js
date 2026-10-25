// コードのきまりを 機械で 見はる（#310）。ふやさないための ラチェット（scripts/ratchet.mjs）が 数を 数える。
// ルールは 2 つだけ。型つき（projectService）が いるのは switch-exhaustiveness-check だけ。
import tseslint from 'typescript-eslint';
import { contentIds } from './scripts/content-ids.mjs';

// アイテム id・ようかい kind（src/inventory/items.ts と src/contracts.ts から 自動で 拾う）
const IDS = contentIds().join('|');
// typeof x === 'string' の 'string' は id では ないので 外す
const IS_ID = `Literal[value=/^(${IDS})$/]`;
const NOT_TYPEOF = ':not(:has(UnaryExpression[operator="typeof"]))';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'perf-results/**', 'ui-gate-report/**', 'test-results/**'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      // union の 取りこぼしを 見つける。default で だまって 受けるのも 報告（considerDefaultExhaustiveForUnions: false）
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: false },
      ],
      // id を コードに 直書きしない（データは src/content/** に 置く）。メッセージの [id-...] は ratchet が 数える目印
      'no-restricted-syntax': [
        'error',
        {
          selector: `BinaryExpression[operator=/^[!=]==$/]:has(> ${IS_ID})${NOT_TYPEOF}`,
          message: '[id-compare] アイテム id・ようかい kind を === / !== で 直書きしない',
        },
        {
          selector: `SwitchCase > ${IS_ID}.test`,
          message: '[id-case] アイテム id・ようかい kind を case で 直書きしない',
        },
      ],
    },
  },
  // 置き場（src/content）と テストは 直書きしてよい
  {
    files: ['src/content/**', '**/*.test.ts', 'e2e/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
