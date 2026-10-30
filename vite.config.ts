import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 하위 경로에서도 열리도록 상대 경로로 빌드
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1' },
});
