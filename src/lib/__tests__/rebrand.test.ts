import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('route architecture', () => {
  it('/study and /hub redirect to the canonical / Study Hub', () => {
    expect(read('src/app/study/page.tsx')).toContain("redirect('/')");
    expect(read('src/app/hub/page.tsx')).toContain("redirect('/')");
  });

  it('the root page renders the Study Hub', () => {
    expect(read('src/app/page.tsx')).toMatch(/StudyHub/);
  });

  it('has a /history page', () => {
    expect(read('src/app/history/page.tsx')).toContain('HistoryPage');
  });
});

describe('public rebrand', () => {
  it('robots.txt points at the new canonical origin', () => {
    const robots = read('public/robots.txt');
    expect(robots).toContain('https://study.infaix.com');
    expect(robots.toLowerCase()).not.toContain('studyforge');
  });

  it('root metadata is branded INFAIX Study', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toContain('INFAIX');
    expect(layout).not.toContain('StudyForge');
  });

  it('every user-facing page and layout component is rebranded', () => {
    const publicFiles = [
      'src/app/page.tsx',
      'src/app/login/page.tsx',
      'src/app/register/page.tsx',
      'src/app/settings/page.tsx',
      'src/app/assessments/page.tsx',
      'src/app/dashboard/page.tsx',
      'src/app/study/timer/page.tsx',
      'src/app/study/stopwatch/page.tsx',
      'src/components/layout/Sidebar.tsx',
      'src/components/layout/Header.tsx',
      'src/components/layout/BrandLogo.tsx',
      'src/components/hub/StudyHub.tsx',
      'src/app/history/page.tsx',
    ];
    for (const rel of publicFiles) {
      expect(read(rel)).not.toContain('StudyForge');
    }
  });
});

describe('migration-sensitive identifiers are preserved', () => {
  it('keeps the studyforge-session cookie name (session + middleware)', () => {
    expect(read('src/lib/auth/session.ts')).toContain("'studyforge-session'");
    expect(read('src/middleware.ts')).toContain('studyforge-session');
  });

  it('keeps localStorage keys so anonymous data is never lost', () => {
    const submission = read('src/lib/client/studySubmission.ts');
    for (const key of [
      'studyforge-pending-segments',
      'studyforge-device-id',
      'studyforge-anon-segments',
      'studyforge-active-timer',
      'studyforge-timer-lock',
    ]) {
      expect(submission).toContain(key);
    }
    expect(read('src/lib/client/goalStore.ts')).toContain('studyforge-anon-goals');
  });

  it('keeps the devLog prefix and flush gate', () => {
    expect(read('src/lib/client/devLog.ts')).toContain("'[studyforge]'");
    expect(read('src/lib/client/useStudyTimeSync.ts')).toContain('__studyforgeFlushAll');
  });
});