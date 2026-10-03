import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ command, mode }) => {
 const env = {...loadEnv(mode, process.cwd(), ''), ...process.env};
 const dataMode = env.VITE_DATA_MODE || 'live';
 if (!['live','fixture'].includes(dataMode)) throw new Error('VITE_DATA_MODE must be live or fixture');
 if (command === 'build' && dataMode === 'fixture') throw new Error('Production build rejected: fixture mode is development only.');
 const proxy = {'/api':{target:'http://127.0.0.1:8000',changeOrigin:true}};
 return {plugins:[react()],server:{proxy},preview:{proxy},build:{outDir:'dist'}};
});
