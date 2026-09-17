'use client';

import Link from 'next/link';
import { BRAND_NAME, PRODUCT_NAME } from '@/lib/brand';

export function BrandLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 shrink-0" aria-label={`${BRAND_NAME} ${PRODUCT_NAME} home`}>
      <span className="text-2xl">🔥</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">{BRAND_NAME}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">
          {PRODUCT_NAME}
        </span>
      </span>
    </Link>
  );
}