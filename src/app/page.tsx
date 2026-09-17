import { StudyHub } from '@/components/hub/StudyHub';

/**
 * The canonical Study Hub. `/`, `/hub` and `/study` all resolve here so the
 * app opens straight into study. Anonymous users see their local data plus a
 * "sign in to sync" prompt — no forced login.
 */
export default function HomePage() {
  return <StudyHub />;
}