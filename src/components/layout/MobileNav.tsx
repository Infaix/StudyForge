'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { name: 'Study Hub', href: '/study', icon: '📖' },
  { name: 'Timer', href: '/study/timer', icon: '⏱️' },
  { name: 'Stopwatch', href: '/study/stopwatch', icon: '⏲️' },
  { name: 'Flashcards', href: '/flashcards', icon: '🎴' },
  { name: 'Notes', href: '/notes', icon: '📝' },
  { name: 'Quizzes', href: '/quizzes', icon: '🧠' },
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Subjects', href: '/subjects', icon: '📚' },
  { name: 'Planner', href: '/planner', icon: '📅' },
  { name: 'Assessments', href: '/assessments', icon: '📋' },
  { name: 'Calculators', href: '/calculators', icon: '🔢' },
  { name: 'Formulas', href: '/formulas', icon: '📐' },
  { name: 'Leaderboard', href: '/leaderboard', icon: '🏆' },
  { name: 'Friends', href: '/friends', icon: '👥' },
  { name: 'Groups', href: '/groups', icon: '👨‍👩‍👧‍👦' },
  { name: 'Profile', href: '/profile', icon: '👤' },
  { name: 'Settings', href: '/settings', icon: '⚙️' },
];

export function MobileNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed bottom-4 right-4 z-50 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-colors"
      >
        {isOpen ? '✕' : '☰'}
      </button>

      {isOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setIsOpen(false)} />
      )}

      <div
        className={`md:hidden fixed bottom-16 right-4 z-40 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-64 max-h-[70vh] overflow-y-auto transition-all duration-200 ${
          isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <nav className="p-3 space-y-0.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/study' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
