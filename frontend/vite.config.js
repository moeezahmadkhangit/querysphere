import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The commit this bundle was built from.
 *
 * Vercel exposes VERCEL_GIT_COMMIT_SHA to the build; locally there is no such
 * thing, so it falls back to 'dev'. It is stamped into index.html rather than
 * into the JavaScript so that verifying a deploy is a single cheap request for
 * a static file, with no need to work out the hashed bundle name first.
 *
 * .github/workflows/deploy-check.yml reads it to prove that a push to main
 * actually reached production, instead of assuming it did.
 */
const COMMIT = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'dev';

function stampCommit() {
  return {
    name: 'stamp-commit',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `  <meta name="qs-commit" content="${COMMIT}" />\n  </head>`
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), stampCommit()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
