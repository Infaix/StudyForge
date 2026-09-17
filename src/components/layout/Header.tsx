'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { BrandLogo } from '@/components/layout/BrandLogo';

export function Header() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color:var(--surface)]/80 backdrop-blur-xl">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="md:hidden">
          <BrandLogo />
        </div>
        <div className="hidden md:block" />
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            Home
          </Link>
          {user ? (
            <div className="flex items-center gap-3">
              <NotificationBell />
              <Link
                href="/profile"
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <img
                  src={user.avatarUrl ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.username)}&background=0D8ABC&color=fff&size=28`}
                  alt={user.displayName || user.username}
                  className="w-7 h-7 rounded-full object-cover"
                />
                <span className="hidden lg:inline">{user.displayName || user.username}</span>
              </Link>
              <button
                onClick={() => {
                  if (window.confirm('Sign out?')) signOut();
                }}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
