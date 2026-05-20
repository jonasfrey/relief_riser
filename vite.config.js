// license Jonas Immanuel Frey GPL
import { defineConfig } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';

// Server-side project store. Active only during `vite dev` (and `vite preview`
// via the same plugin hook). Writes plain JSON files to ./projects/ alongside
// the repo so they're easy to inspect, back up, or .gitignore.
const PROJECTS_DIR = path.resolve(process.cwd(), 'projects');
const MAX_BODY_BYTES = 100 * 1024 * 1024;

function sanitizeBaseName(name) {
  const cleaned = String(name || '')
    .replace(/\.[Jj][Ss][Oo][Nn]$/, '')
    .replace(/[^A-Za-z0-9._\- ]+/g, '_')
    .replace(/^\.+/, '')      // no hidden files
    .trim()
    .slice(0, 200);
  return cleaned || 'untitled';
}

function projectFilePath(name) {
  const base = sanitizeBaseName(name);
  const fp = path.resolve(PROJECTS_DIR, base + '.json');
  // Defence in depth: refuse anything that resolves outside the projects dir.
  if (!fp.startsWith(PROJECTS_DIR + path.sep)) {
    throw new Error('Invalid project name');
  }
  return { fp, baseName: base };
}

async function ensureProjectsDir() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error(`Request body too large (> ${MAX_BODY_BYTES} bytes)`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(text));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function projectsApiPlugin() {
  return {
    name: 'relief-riser-projects-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/projects')) return next();
        try {
          await ensureProjectsDir();
          const url = new URL(req.url, 'http://local');
          const parts = url.pathname.split('/').filter(Boolean); // ['api','projects', maybe name]
          const name = parts.length >= 3 ? decodeURIComponent(parts.slice(2).join('/')) : null;

          if (req.method === 'GET' && !name) {
            const files = await fs.readdir(PROJECTS_DIR);
            const out = [];
            for (const f of files) {
              if (!f.toLowerCase().endsWith('.json')) continue;
              try {
                const st = await fs.stat(path.join(PROJECTS_DIR, f));
                out.push({
                  name: f.slice(0, -5),
                  size: st.size,
                  savedAt: st.mtime.toISOString()
                });
              } catch {}
            }
            out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
            return sendJson(res, 200, out);
          }

          if (req.method === 'GET' && name) {
            const { fp } = projectFilePath(name);
            const data = await fs.readFile(fp, 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
            return;
          }

          if (req.method === 'PUT' && name) {
            const body = await readJsonBody(req);
            if (!body || body.format !== 'relief-riser-project') {
              return sendJson(res, 400, { error: 'Not a Relief Riser project file' });
            }
            const { fp, baseName } = projectFilePath(name);
            await fs.writeFile(fp, JSON.stringify(body));
            const st = await fs.stat(fp);
            return sendJson(res, 200, {
              name: baseName,
              size: st.size,
              savedAt: st.mtime.toISOString()
            });
          }

          if (req.method === 'DELETE' && name) {
            const { fp } = projectFilePath(name);
            await fs.unlink(fp);
            res.statusCode = 204;
            res.end();
            return;
          }

          return sendJson(res, 405, { error: 'Method not allowed' });
        } catch (err) {
          const msg = err && err.message ? err.message : String(err);
          const status = /ENOENT/.test(msg) ? 404 : 500;
          return sendJson(res, status, { error: msg });
        }
      });
    }
  };
}

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: true
  },
  plugins: [projectsApiPlugin()]
});
