import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'win32') {
  throw new Error('This local setup helper currently supports Windows only. Use environment variables elsewhere.');
}

const token = randomBytes(24).toString('base64url');
const path = `/configure/${token}`;
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );

  if (request.url !== path) {
    response.writeHead(404).end('Not found');
    return;
  }
  if (request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><meta name="viewport" content="width=device-width">
      <title>Configure FINVERSE Plaid Sandbox</title>
      <style>body{font:16px system-ui;max-width:560px;margin:48px auto;padding:20px}label{display:block;margin:18px 0 6px}input{box-sizing:border-box;width:100%;padding:12px}button{margin-top:24px;padding:12px 18px}</style>
      <h1>Configure FINVERSE Plaid Sandbox</h1>
      <p>Credentials are sent only to this one-time server on 127.0.0.1 and stored in your Windows user environment.</p>
      <form method="post">
        <label for="clientId">Plaid client ID</label><input id="clientId" name="clientId" required autocomplete="off">
        <label for="secret">Plaid Sandbox secret</label><input id="secret" name="secret" type="password" required autocomplete="off">
        <button type="submit">Save locally</button>
      </form>`);
    return;
  }
  if (request.method !== 'POST') {
    response.writeHead(405).end('Method not allowed');
    return;
  }

  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk: string) => {
    body += chunk;
    if (body.length > 2_048) request.destroy();
  });
  request.on('end', () => {
    const form = new URLSearchParams(body);
    const clientId = form.get('clientId')?.trim() ?? '';
    const secret = form.get('secret')?.trim() ?? '';
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(clientId) || !/^[A-Za-z0-9_-]{20,200}$/.test(secret)) {
      response.writeHead(400).end('The Plaid credentials did not have the expected format.');
      return;
    }
    const encryptionKey = randomBytes(32).toString('base64');
    const command = [
      "[Environment]::SetEnvironmentVariable('PLAID_CLIENT_ID',$env:FINVERSE_PLAID_CLIENT_ID,'User')",
      "[Environment]::SetEnvironmentVariable('PLAID_SECRET',$env:FINVERSE_PLAID_SECRET,'User')",
      "[Environment]::SetEnvironmentVariable('PLAID_ENVIRONMENT','sandbox','User')",
      "[Environment]::SetEnvironmentVariable('PLAID_COUNTRIES','CA,US','User')",
      "$existingBankKey=[Environment]::GetEnvironmentVariable('BANK_TOKEN_ENCRYPTION_KEY','User')",
      "if([string]::IsNullOrWhiteSpace($existingBankKey)){[Environment]::SetEnvironmentVariable('BANK_TOKEN_ENCRYPTION_KEY',$env:FINVERSE_BANK_KEY,'User')}",
    ].join(';');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      env: {
        ...process.env,
        FINVERSE_PLAID_CLIENT_ID: clientId,
        FINVERSE_PLAID_SECRET: secret,
        FINVERSE_BANK_KEY: encryptionKey,
      },
      stdio: 'ignore',
    });
    if (result.status !== 0) {
      response.writeHead(500).end('Windows could not save the variables.');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<h1>FINVERSE Plaid Sandbox configured</h1><p>You can close this tab. Restart open terminals and Android Studio before running the app.</p>');
    setImmediate(() => server.close());
  });
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start setup server.');
  console.log(`Open http://127.0.0.1:${address.port}${path}`);
});
setTimeout(() => server.close(), 2 * 60_000).unref();
