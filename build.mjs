import esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';

const watch = process.argv.includes('--watch');

// Auto-increment patch version in manifest.json on each build (skipped during release)
if (!watch && !process.env.RELEASE_BUILD) {
  const manifestPath = 'manifest.json';
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const parts = manifest.version.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  manifest.version = parts.join('.');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Version: ${manifest.version}`);
}

const common = {
  bundle: true,
  sourcemap: true,
  target: 'chrome120',
  logLevel: 'info',
  minify: true,
};

const configs = [
  {
    ...common,
    entryPoints: ['src/popup.ts'],
    outfile: 'dist/popup.js',
    format: 'iife',
  },
  {
    ...common,
    entryPoints: ['src/content.ts'],
    outfile: 'dist/content.js',
    format: 'iife',
  },
  {
    ...common,
    entryPoints: ['src/background.ts'],
    outfile: 'dist/background.js',
    format: 'iife',
  },
];

for (const config of configs) {
  if (watch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
  } else {
    await esbuild.build(config);
  }
}
