import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'picsew-offline',
      enforce: 'post',
      transformIndexHtml() {
        const commit = /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '')
          ? process.env.GITHUB_SHA!
          : 'local';
        return [
          {
            tag: 'meta',
            attrs: { name: 'picsew-build', content: commit },
            injectTo: 'head',
          },
        ];
      },
      generateBundle(_options, bundle) {
        const files = [
          './index.html',
          './build-info.json',
          './manifest.webmanifest',
          './icon-192.png',
          './icon-512.png',
          ...Object.keys(bundle)
            .filter((file) => /\.(js|css|woff2?)$/.test(file))
            .map((file) => './' + file),
        ];
        this.emitFile({
          type: 'asset',
          fileName: 'build-info.json',
          source: JSON.stringify({
            commit: process.env.GITHUB_SHA || 'local',
            builtAt: new Date().toISOString(),
          }),
        });
        const version = createHash('sha256')
          .update(
            JSON.stringify(files) +
              readFileSync('index.html', 'utf8') +
              readFileSync('public/manifest.webmanifest', 'utf8') +
              readFileSync('src/service-worker.js', 'utf8') +
              (process.env.GITHUB_SHA || 'local')
          )
          .digest('hex')
          .slice(0, 16);
        const source = readFileSync('src/service-worker.js', 'utf8')
          .replace('__CACHE_VERSION__', version)
          .replace('__PRECACHE_FILES__', JSON.stringify(files));
        this.emitFile({ type: 'asset', fileName: 'sw.js', source });
      },
    },
  ],
  base: './',
});
