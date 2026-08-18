'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <header className="border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <span className="text-xl font-bold text-gray-900 dark:text-white">StudyForge</span>
          </div>
          <nav className="hidden sm:flex items-center gap-8">
            <Link
              href="/study"
              className={user ? 'text-gray-700 dark:text-gray-300 hover:text-blue-600' : 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium'}
              onClick={user ? undefined : () => router.push('/study')}
            >
              Study
            </Link>
            <Link
              href="/study/timer"
              className={user ? 'text-gray-700 dark:text-gray-300 hover:text-blue-600' : 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium'}
            >
              Timer
            </Link>
            <Link
              href="/study/stopwatch"
              className={user ? 'text-gray-700 dark:text-gray-300 hover:text-blue-600' : 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium'}
            >
              Stopwatch
            </Link>
            <Link
              href="/study/flashcards"
              className={user ? 'text-gray-700 dark:text-gray-300 hover:text-blue-600' : 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium'}
            >
              Flashcards
            </Link>
            <Link
              href="/study/quiz"
              className={user ? 'text-gray-700 dark:text-gray-300 hover:text-blue-600' : 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium'}
            >
              Quiz
            </Link>
            <Link
              href="/study/notes"
              className={user ? 'text-gray-700 dark:text-gray-300 hover:text-blue-600' : 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium'}
            >
              Notes
            </Link>
            <Link
              href="/leaderboard"
              className={user ? 'text-gray-700 dark:text-gray-300 hover:text-blue-600' : 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium'}
            >
              Leaderboard
            </Link>
            <Link
              href="/friends"
              className={user ? 'text-gray-700 dark:text-gray-300 hover:text-blue-600' : 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium'}
            >
              Friends
            </Link>
            <Link
              href="/groups"
              className={user ? 'text-gray-700 dark:text-gray-300 hover:text-blue-600' : 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium'}
            >
              Groups
            </Link>
            <Link
              href="/account"
              className={user ? 'text-gray-700 dark:text-gray-300 hover:text-blue-600' : 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium'}
            >
              Account
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <div className="relative">
                <img
                  src={user.avatarUrl ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.username)}&background=0D8ABC&color=fff&size=32`}
                  alt={user.displayName || user.username}
                  className="w-8 h-8 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-white">{user.displayName || user.username}</span>
                <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-800 transition-colors font-medium"
                >
                  Create Account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              Build better study habits.
              <br />
              Master every subject.
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-10">
              The free, student-first productivity platform that helps you organise subjects, 
              track assessments, and know exactly what to study next.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/study"
                className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-lg font-medium"
              >
                Start Studying Free
              </Link>
              <Link
                href="/dashboard"
                className="px-8 py-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors text-lg font-medium"
              >
                Learn More
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-gray-50 dark:bg-gray-800 py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
              Everything you need to succeed
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="text-3xl mb-4">📚</div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Organise Subjects
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Create subjects, track topics, and monitor your mastery across all your courses.
                </p>
              </div>

              <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="text-3xl mb-4">📝</div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Track Assessments
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Never miss a deadline. Track exams, assignments, and their impact on your grades.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
              Start building better study habits today
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
              Join thousands of students who are already mastering their subjects with StudyForge.
            </p>
            <Link
              href="/study"
              className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-lg font-medium"
            >
              Get Started Free
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600 dark:text-gray-400">
          <p>&copy; 2026 StudyForge. Built for students, by students.</p>
        </div>
      </footer>
    </div>
  );
}