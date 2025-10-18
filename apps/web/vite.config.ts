import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

interface WorkspacePaths {
  workspaceRoot: string;
  domainDir: string;
}

function resolveWorkspacePaths(): WorkspacePaths {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidateRoots = [
    path.resolve(currentDir, '..', '..'),
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '..', '..')
  ];

  for (const rootDir of candidateRoots) {
    const domainPath = path.resolve(rootDir, 'packages', 'domain');
    if (fs.existsSync(domainPath)) {
      return {
        workspaceRoot: rootDir,
        domainDir: domainPath
      };
    }
  }

  throw new Error('Unable to locate packages/domain directory for alias resolution.');
}

const { workspaceRoot, domainDir } = resolveWorkspacePaths();

export default defineConfig({
  plugins: [react()],
  base: '/',            // ← 重要: 直リンク時のアセット参照ずれ防止
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: [workspaceRoot]
    }
  },
  preview: {
    port: 4173,
    host: true
  },
  resolve: {
    alias: {
      '@domain': domainDir
    }
  },
  build: {
    outDir: 'dist',     // 明示（デフォルトと同じだが、Vercel側の設定と揃える意味で）
    assetsDir: 'assets' // 任意（既定でも可）。CDN等に分けないならそのままでOK
  }
});
