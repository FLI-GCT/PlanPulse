import viteTailwindcss from '@tailwindcss/vite';
import viteReact from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { tanstackRouter as tanstackRouterVite } from '@tanstack/router-plugin/vite';
import { virtualRouteConfig } from './src/route-tree.ts';

const isTest = process.env.NODE_ENV === 'test';

export default defineConfig({
  base: '/',
  plugins: [
    viteReact(),
    viteTailwindcss(),
    !isTest &&
      tanstackRouterVite({
        virtualRouteConfig,
        routesDirectory: 'src/features',
        generatedRouteTree: 'src/route-tree.gen.ts',
        target: 'react',
      }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: true,
    outDir: 'dist',
  },
  server: {
    port: 5173,
  },
});
