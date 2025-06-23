declare module '@crxjs/vite-plugin' {
  import { Plugin } from 'vite';
  
  interface CrxOptions {
    manifest: any;
  }
  
  export function crx(options: CrxOptions): Plugin;
} 