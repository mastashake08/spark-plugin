import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'vue/index': 'src/vue/index.ts',
    'react/index': 'src/react/index.ts',
    'vanilla/index': 'src/vanilla/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ['vue', 'react'],
});
