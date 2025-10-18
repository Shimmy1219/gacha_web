import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
const packagesDir = path.resolve(workspaceRoot, 'packages').replace(/\\/g, '/');
const domainDir = `${packagesDir}/domain`;

export default defineConfig({
  plugins: [react()],
  base: '/',            // ← 重要: 直リンク時のアセット参照ずれ防止
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: [fileURLToPath(new URL('.', import.meta.url)), packagesDir]
    }
  },
  preview: {
    port: 4173,
    host: true
  },
  resolve: {
    alias: [
      { find: /^@domain\/?$/, replacement: domainDir },
      { find: /^@domain\/app-persistence$/, replacement: `${domainDir}/app-persistence/index.ts` },
      { find: /^@domain\/(.*)$/, replacement: `${domainDir}/$1` }
    ]
  },
  build: {
    outDir: 'dist',     // 明示（デフォルトと同じだが、Vercel側の設定と揃える意味で）
    assetsDir: 'assets' // 任意（既定でも可）。CDN等に分けないならそのままでOK
  }
});
