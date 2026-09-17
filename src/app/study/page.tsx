import { redirect } from 'next/navigation';

/** /study root redirects to the canonical Study Hub at /. */
export default function StudyRoot() {
  redirect('/');
}