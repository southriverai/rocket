import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path for GitHub Pages: https://<username>.github.io/<repo-name>/
// Override with --base /your-repo/ when building, or set GITHUB_PAGES=true in CI
const base = process.env.GITHUB_PAGES ? '/rocket/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  worker: {
    format: 'es',
  },
});
