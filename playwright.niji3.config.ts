// 使い道: WEAPON-9 虹の 斬撃 v3・ドーム B の ゲーム内 スクショ（npx playwright test --config playwright.niji3.config.ts）。CI では 使わない。
import { defineConfig } from '@playwright/test';
import base from './playwright.niji.config';

export default defineConfig({ ...base, testMatch: '**/weapon9-v3-shots.shots.ts' });
