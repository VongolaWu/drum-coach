import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'node:fs';
import path from 'node:path';

const certDir = path.resolve(__dirname, 'certs');
const keyPath = path.join(certDir, 'drum-coach-local.key');
const certPath = path.join(certDir, 'drum-coach-local.crt');

const hasCustomCertificate = fs.existsSync(keyPath) && fs.existsSync(certPath);
const httpsOptions = hasCustomCertificate
  ? {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    }
  : true;

export default defineConfig({
  base: './',
  plugins: [vue(), basicSsl()],
  server: {
    https: httpsOptions,
    host: true,
    port: 5173
  },
  preview: {
    https: httpsOptions,
    host: true,
    port: 4173
  }
});
