'use client';

import React from 'react';
import Link from 'next/link';

export function Header() {
  return (
    <header className="bg-white border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700 sticky top-0 z-30">
      <div className="flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 md:hidden">
          <span className="text-2xl">🔥</span>
          <span className="text-xl font-bold text-gray-900 dark:text-white">StudyForge</span>
        </Link>
        <div className="hidden md:block" />
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </header>
  );
}
