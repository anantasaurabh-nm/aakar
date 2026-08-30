import path from 'node:path';

// Resolved relative to the backend process's working directory
// (public_html/backend, true for both `nest start --watch` and `node
// dist/src/main.js`), not __dirname, so it's immune to dist/ layout changes.
export const MODULES_DIR = path.resolve(process.cwd(), '..', 'modules');
