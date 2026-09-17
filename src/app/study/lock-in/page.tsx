'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { subjectStorage } from '@/lib/storage';
import { useStudyTimeSync } from '@/lib/client/useStudyTimeSync';
import type { Subject } from '@/types';
import { createLockInMetadata, parseLockInMetadata, isLockInTargetReached } from '@/lib/client/lockIn';

const META_KEY = 'studyforge-lock-in-meta';
const formatClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function LockInPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [targetSeconds, setTargetSeconds] = useState(3600);
  const [started, setStarted] = useState(false);
  const [tick, setTick] = useState(0);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const subject = subjects.find((item) => item.id === subjectId) ?? null;
  const sync = useStudyTimeSync({ mode: 'stopwatch', getSubject: useCallback(() => ({ id: subjectId || undefined, name: subject?.name ?? null }), [subjectId, subject]) });
  void tick;

  useEffect(() => { subjectStorage.getAll().then(setSubjects).catch(() => undefined); const meta = parseLockInMetadata(localStorage.getItem(META_KEY)); if (meta) { setSubjectId(meta.subjectId); setTargetSeconds(meta.targetSeconds); } else localStorage.removeItem(META_KEY); }, []);
  useEffect(() => { const id = setInterval(() => setTick((value) => value + 1), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!started) return; localStorage.setItem(META_KEY, JSON.stringify(createLockInMetadata({ subjectId, targetSeconds }))); }, [started, subjectId, targetSeconds]);
  const requestWakeLock = useCallback(async () => { if (!('wakeLock' in navigator)) return; try { wakeLock.current = await navigator.wakeLock.request('screen'); wakeLock.current.addEventListener('release', () => { wakeLock.current = null; }); } catch { /* optional enhancement */ } }, []);
  useEffect(() => { const onVisible = () => { if (document.visibilityState === 'visible' && started && !sync.isAnonymous) void requestWakeLock(); }; document.addEventListener('visibilitychange', onVisible); return () => { document.removeEventListener('visibilitychange', onVisible); wakeLock.current?.release().catch(() => undefined); }; }, [started, sync.isAnonymous, requestWakeLock]);
  const begin = () => { sync.beginSession(); sync.openRun(); setStarted(true); void requestWakeLock(); };
  const pause = async () => { await sync.pauseAndFlush(); wakeLock.current?.release().catch(() => undefined); setStarted(false); };
  const resume = () => { sync.resumeRun(); setStarted(true); void requestWakeLock(); };
  const finish = async () => { await sync.stopAndClose(); wakeLock.current?.release().catch(() => undefined); localStorage.removeItem(META_KEY); router.push('/'); };
  const reached = isLockInTargetReached(sync.studiedSeconds(), targetSeconds);
  if (!subjects.length && !subjectId) return <main className="mx-auto max-w-lg p-6"><p className="text-gray-500">Loading subjects…</p></main>;
  return <main className="min-h-screen bg-gray-950 px-5 py-8 text-white"><div className="mx-auto max-w-xl"><button onClick={() => router.push('/')} className="mb-10 text-sm text-gray-400 hover:text-white">← INFAIX / STUDY</button><p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-400">Exam Lock-In</p>{!started && sync.status === 'idle' ? <section className="mt-8 rounded-2xl bg-gray-900 p-6"><h1 className="text-2xl font-bold">Choose your focus</h1><label className="mt-6 block text-sm text-gray-400">Subject<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-white"><option value="">Choose a subject</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><fieldset className="mt-6"><legend className="text-sm text-gray-400">Target duration</legend><div className="mt-2 grid grid-cols-4 gap-2">{[1500,2700,3600,5400].map((value) => <button type="button" key={value} onClick={() => setTargetSeconds(value)} className={`rounded-lg border p-3 text-sm ${targetSeconds === value ? 'border-blue-400 bg-blue-500/20' : 'border-gray-700'}`}>{value / 60}m</button>)}</div></fieldset><button disabled={!subjectId} onClick={begin} className="mt-8 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">Begin Lock-In</button></section> : <section className="mt-16 text-center"><p className="text-gray-400">{subject?.name ?? 'Study session'}</p><div className="mt-5 font-mono text-7xl font-bold tracking-tight">{formatClock(sync.studiedSeconds())}</div><p className="mt-4 text-gray-400">Target {formatClock(targetSeconds)}</p>{reached && <div role="status" className="mt-6 rounded-lg border border-green-800 bg-green-950/50 px-4 py-3 text-sm text-green-300">Lock-In target reached. Keep studying or finish when you’re ready.</div>}<div className="mt-8 flex justify-center gap-3"><button onClick={started ? pause : resume} className="rounded-lg border border-gray-600 px-5 py-3 font-semibold hover:bg-gray-800">{started ? 'Pause' : 'Resume'}</button><button onClick={finish} className="rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500">Finish session</button></div><p className="mt-6 text-xs text-gray-500" role="status">{sync.status === 'offline' ? 'Offline · saved on this device' : sync.status === 'syncing' ? 'Syncing…' : sync.status === 'pending' ? 'Saving…' : 'Saved'}</p></section>}</div></main>;
}
