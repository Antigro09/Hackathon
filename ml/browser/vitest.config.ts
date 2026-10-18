import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['ml/browser/**/*.test.ts'], environment: 'node' } });
