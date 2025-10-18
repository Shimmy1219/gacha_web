import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const toPosixPath = (value: string) => value.replace(/\\/g, '/');

const projectRoot = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const domainDir = toPosixPath(path.join(projectRoot, 'src/domain'));

export default defineConfig({
  plugins: [react()],
  base: '/',            // ← 重要: 直リンク時のアセット参照ずれ防止
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: [toPosixPath(projectRoot), domainDir]
    }
  },
  preview: {
    port: 4173,
    host: true
  },
  resolve: {
    alias: [
      { find: /^@domain\/?$/, replacement: domainDir },
      {
        find: /^@domain\/app-persistence$/,
        replacement: `${domainDir}/app-persistence/index.ts`
      },
      { find: /^@domain\/(.*)$/, replacement: `${domainDir}/$1` }
    ]
  },
  build: {
    outDir: 'dist',     // 明示（デフォルトと同じだが、Vercel側の設定と揃える意味で）
    assetsDir: 'assets' // 任意（既定でも可）。CDN等に分けないならそのままでOK
  }
});
