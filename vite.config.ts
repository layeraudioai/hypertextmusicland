import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  base: './', // Ensures relative paths in the generated index.html
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  plugins: [
    tailwindcss(),
    react()
  ]
});
