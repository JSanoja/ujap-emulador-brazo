import { defineConfig } from 'vitest/config';

// Cobertura mínima del núcleo (aceptación de N1: ≥ 80 %).
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/index.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
