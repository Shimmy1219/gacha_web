import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const toPosixPath = (value: string) => value.replace(/\\/g, '/');

const findWorkspaceRoot = (startDir: string): string | null => {
  let currentDir = startDir;

  while (true) {
    const packagesPath = path.join(currentDir, 'packages');
    if (fs.existsSync(packagesPath) && fs.statSync(packagesPath).isDirectory()) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
};

const resolveWorkspaceRoot = (): string => {
  const candidateDirs = Array.from(
    new Set([
      fs.realpathSync(path.dirname(fileURLToPath(import.meta.url))),
      fs.realpathSync(process.cwd())
    ])
  );

  for (const candidate of candidateDirs) {
    const result = findWorkspaceRoot(candidate);
    if (result) {
      return result;
    }
  }

  throw new Error('Failed to locate workspace root containing packages directory.');
};

const workspaceRoot = resolveWorkspaceRoot();
const packagesDir = toPosixPath(path.join(workspaceRoot, 'packages'));
const domainDir = `${packagesDir}/domain`;

export default defineConfig({
  plugins: [react()],
  base: '/',            // ← 重要: 直リンク時のアセット参照ずれ防止
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: [toPosixPath(workspaceRoot), packagesDir]
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
