import { existsSync } from 'node:fs';
import { createBackend } from './backend';
import { readConfig } from './config';

if (existsSync('.env')) process.loadEnvFile('.env');
const config = readConfig();
const backend = await createBackend(config);
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const host = process.env.API_HOST || (config.production ? '0.0.0.0' : '127.0.0.1');
const server = backend.app.listen(port, host, () => {
  console.log(`kotoba API: http://${host}:${port}`);
  if (!config.smtp && !config.resend)
    console.log('ローカル開発用: メール確認・再設定はメール配信の設定後に有効になります。');
});
function stop() {
  server.close(async () => {
    await backend.close();
    process.exit(0);
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
