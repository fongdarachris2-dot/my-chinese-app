import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // 先處理第三方庫
          if (id.includes('node_modules')) {
            // React 獨立
            if (id.includes('/react/') || id.includes('/react-dom/')) return 'react';

            // Firebase 分包
            if (id.includes('/@firebase/firestore')) return 'firebase-firestore';
            if (id.includes('/@firebase/auth')) return 'firebase-auth';
            if (id.includes('/@firebase/storage')) return 'firebase-storage';
            if (id.includes('/@firebase/messaging')) return 'firebase-messaging';

            // 其餘 Firebase 核心與共用模組（app, util, logger, component…）
            if (id.includes('/@firebase/')) return 'firebase-core';

            // 其他第三方通通進 vendor
            return 'vendor';
          }

          // 其他本地端程式碼照預設規則
        },
      },
    },
  },
});
