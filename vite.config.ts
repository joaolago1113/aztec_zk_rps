import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
    plugins: [
        nodePolyfills({ protocolImports: true })
    ],
    resolve: {
        alias: {
            'fs': 'node:fs',
            'path': 'node:path'
        },
    },
    build: {
        target: 'esnext',
        sourcemap: true
    },
    optimizeDeps: {
        esbuildOptions: {
            target: 'esnext'
        }
    }
});
