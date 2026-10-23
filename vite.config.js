import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                // three.js pesa más que todo el resto junto: va en su propio chunk
                // para que se cachee aparte y el boot screen pinte antes.
                manualChunks: { three: ['three'] },
            },
        },
    },
});
