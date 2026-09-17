import { redirect } from 'next/navigation';

/** /hub is legacy — the canonical Study Hub now lives at /. */
export default function HubRoot() {
  redirect('/');
}