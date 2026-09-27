import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = { '/api': `http://127.0.0.1:${env.API_PORT || '3001'}` };
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy,
      port: Number(env.WEB_PORT || 5173),
      strictPort: true,
      // 検証用ブラウザの一時ファイルはWindowsでロックされるため、監視対象から外す。
      watch: { ignored: ['**/.artifacts/**', '**/.npm-cache/**', '**/.data/**'] },
    },
    preview: { proxy },
  };
});
