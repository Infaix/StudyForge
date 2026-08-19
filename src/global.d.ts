import type { D1Database } from '@cloudflare/workers-types';

declare global {
  interface CloudflareEnv {
    DATABASE: D1Database;
  }
}

export {};
