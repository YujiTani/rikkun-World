import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: './e2e-perf',
  testMatch: '**/*.perf.ts',
  fullyParallel: false,
  workers: 1,
});
