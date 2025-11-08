import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

const toPosixPath = (value: string) => value.replace(/\\/g, '/');

const projectRoot = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const domainDir = toPosixPath(path.join(projectRoot, 'src/domain'));
const iconsSourceDir = path.resolve(projectRoot, '../../icon');
const iconsPublicDir = path.resolve(projectRoot, 'public/icon');

const copyRootIconsPlugin = (): PluginOption => {
  const syncIcons = () => {
    if (!fs.existsSync(iconsSourceDir)) {
      return;
    }

    fs.mkdirSync(iconsPublicDir, { recursive: true });

    const desiredFiles = new Set<string>();

    for (const entry of fs.readdirSync(iconsSourceDir, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }

      const sourcePath = path.join(iconsSourceDir, entry.name);
      const destinationPath = path.join(iconsPublicDir, entry.name);
      fs.copyFileSync(sourcePath, destinationPath);
      desiredFiles.add(entry.name);
    }

    for (const entry of fs.readdirSync(iconsPublicDir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name === '.gitignore') {
        continue;
      }

      if (!desiredFiles.has(entry.name)) {
        fs.rmSync(path.join(iconsPublicDir, entry.name));
      }
    }
  };

  return {
    name: 'copy-root-icons',
    buildStart() {
      syncIcons();
    },
    configureServer(server) {
      syncIcons();

      if (!fs.existsSync(iconsSourceDir)) {
        return;
      }

      server.watcher.add(iconsSourceDir);
      const triggerSync = (file: string) => {
        const resolved = path.resolve(file);
        if (resolved.startsWith(iconsSourceDir)) {
          syncIcons();
        }
      };

      server.watcher.on('add', triggerSync);
      server.watcher.on('change', triggerSync);
      server.watcher.on('unlink', triggerSync);
    }
  };
};

export default defineConfig({
  plugins: [react(), copyRootIconsPlugin()],
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
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    globals: true
  }
});
