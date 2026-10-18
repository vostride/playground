import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/shop/',plugins:[react()],build:{outDir:'../../dist/shop',emptyOutDir:true}});
