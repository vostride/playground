import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const port = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};
const headers = {};
for (const line of (await readFile(path.join(root, '_headers'), 'utf8')).split('\n')) {
  const match = /^\s+([^:]+):\s*(.+)$/.exec(line);
  if (match) headers[match[1].trim()] = match[2].trim();
}
const redirects = (await readFile(path.join(root, '_redirects'), 'utf8'))
  .split('\n')
  .filter((line) => line.trim() && !line.startsWith('#'))
  .map((line) => line.trim().split(/\s+/));
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      const redirect = redirects.find((rule) => rule[0] === pathname);
      if (redirect) {
        res.writeHead(Number(redirect[2]), { ...headers, location: redirect[1] + url.search });
        res.end();
        return;
      }
      let file = path.resolve(root, '.' + pathname);
      if (file !== root && !file.startsWith(root + path.sep)) {
        res.writeHead(403, headers);
        res.end();
        return;
      }
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const data = await readFile(file);
      res.writeHead(200, {
        ...headers,
        'content-type': mime[path.extname(file)] || 'application/octet-stream',
      });
      res.end(data);
    } catch {
      res.writeHead(404, { ...headers, 'content-type': 'text/html' });
      res.end(
        await readFile(path.join(root, '404.html'), 'utf8').catch(() => '<h1>Not found</h1>'),
      );
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`Playground at http://127.0.0.1:${port}`));
