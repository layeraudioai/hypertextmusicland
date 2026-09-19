import { defineConfig } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
    main: {
        build: {
            rollupOptions: {
                input: resolve(__dirname, 'src/main/index.ts'),
            },
        },
    },
    preload: {
        build: {
            rollupOptions: {
                input: {
                    preload: resolve(__dirname, 'src/preload/index.ts'),
                },
            },
        },
    },
    renderer: {
        build: {
            rollupOptions: {
                input: resolve(__dirname, 'index.html'),
            },
        },
    },
});