import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';

export interface ServerInstance {
  server: Server;
  url: string;
  port: number;
}

let defaultServerInstance: Server | null = null;

const BASIC_HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>EITR E2E Test Target</title>
</head>
<body>
  <h1>E2E Test Dummy Application</h1>
  <main id="app">
    <button id="submit-btn" type="button">Submit</button>
    <input id="username-input" type="text" placeholder="Enter username" />
    <select id="country-select">
      <option value="us">United States</option>
      <option value="ca">Canada</option>
      <option value="uk">United Kingdom</option>
    </select>
    <div role="checkbox" id="terms-checkbox" aria-checked="false" tabindex="0">Accept Terms</div>
  </main>
</body>
</html>`;

export async function startServer(port = 0): Promise<ServerInstance> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(BASIC_HTML_PAGE);
    });

    server.listen(port, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const url = `http://127.0.0.1:${addr.port}`;
      defaultServerInstance = server;
      resolve({ server, url, port: addr.port });
    });

    server.on('error', (err) => reject(err));
  });
}

export async function stopServer(serverToStop?: Server): Promise<void> {
  const target = serverToStop ?? defaultServerInstance;
  if (!target) return;

  return new Promise((resolve, reject) => {
    target.close((err) => {
      if (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ERR_SERVER_NOT_RUNNING') {
          resolve();
        } else {
          reject(err);
        }
      } else {
        if (target === defaultServerInstance) {
          defaultServerInstance = null;
        }
        resolve();
      }
    });
  });
}
