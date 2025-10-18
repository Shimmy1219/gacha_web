import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const toPosixPath = (value: string): string => value.split(path.sep).join('/');

const currentDir = fileURLToPath(new URL('.', import.meta.url));
const workspaceRoot = path.resolve(currentDir, '..', '..');
const packagesDir = path.resolve(workspaceRoot, 'packages');
const domainDir = path.resolve(packagesDir, 'domain');

const packagesDirPosix = toPosixPath(packagesDir);
const domainDirPosix = toPosixPath(domainDir);

export default defineConfig({
  plugins: [react()],
  base: '/',            // ← 重要: 直リンク時のアセット参照ずれ防止
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: [currentDir, packagesDir]
    }
  },
  preview: {
    port: 4173,
    host: true
  },
  resolve: {
    alias: [
      { find: /^@domain\/?$/, replacement: `${domainDirPosix}/index.ts` },
      { find: /^@domain\/app-persistence$/, replacement: `${domainDirPosix}/app-persistence/index.ts` },
      { find: /^@domain\/(.*)$/, replacement: `${domainDirPosix}/$1` }
    ]
  },
  build: {
    outDir: 'dist',     // 明示（デフォルトと同じだが、Vercel側の設定と揃える意味で）
    assetsDir: 'assets' // 任意（既定でも可）。CDN等に分けないならそのままでOK
  }
});
