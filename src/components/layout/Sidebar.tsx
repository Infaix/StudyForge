'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/contexts/ThemeContext';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Subjects', href: '/subjects', icon: '📚' },
  { name: 'Planner', href: '/planner', icon: '📅' },
  { name: 'Flashcards', href: '/flashcards', icon: '🎴' },
  { name: 'Quizzes', href: '/quizzes', icon: '🧠' },
  { name: 'Assessments', href: '/assessments', icon: '📝' },
  { name: 'Focus', href: '/focus', icon: '🎯' },
  { name: 'Calculators', href: '/calculators', icon: '🔢' },
  { name: 'Settings', href: '/settings', icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 dark:bg-gray-800 dark:border-gray-700 h-screen sticky top-0">
      <div className="p-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          <span className="text-xl font-bold text-gray-900 dark:text-white">StudyForge</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Theme</span>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme('light')}
              className={`p-2 rounded-lg transition-colors ${
                theme === 'light' ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="Light mode"
            >
              ☀️
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`p-2 rounded-lg transition-colors ${
                theme === 'dark' ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="Dark mode"
            >
              🌙
            </button>
            <button
              onClick={() => setTheme('system')}
              className={`p-2 rounded-lg transition-colors ${
                theme === 'system' ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="System theme"
            >
              💻
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
