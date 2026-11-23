import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

const sanitizeEnvValue = (value?: string): string =>
  (value ?? '').trim().replace(/^["']|["']$/g, '');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = sanitizeEnvValue(env.VITE_SUPABASE_URL || env.SUPABASE_URL);
  const rawPublishable = sanitizeEnvValue(
    env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY
  );
  const rawAnon = sanitizeEnvValue(
    env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || rawPublishable
  );
  const safePublishable = rawPublishable.startsWith('sb_secret_') ? '' : rawPublishable;
  const safeAnon = rawAnon.startsWith('sb_secret_') ? safePublishable : rawAnon;

  return {
    plugins: [react(), tailwindcss()],
    define: {
      ...(supabaseUrl
        ? { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl) }
        : {}),
      ...(safeAnon
        ? { 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(safeAnon) }
        : {}),
      ...(safePublishable
        ? {
            'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':
              JSON.stringify(safePublishable),
          }
        : {}),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react-dom') || id.includes('/react/')) return 'react-vendor';
              if (id.includes('@supabase/supabase-js')) return 'supabase';
              if (id.includes('lucide-react')) return 'icons';
            }
          },
        },
      },
    },
  };
});
