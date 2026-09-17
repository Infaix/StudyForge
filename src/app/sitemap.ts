import type { MetadataRoute } from 'next';
import { APP_ORIGIN } from '@/lib/brand';

/**
 * Search-engine sitemap. Only the anonymous-capable Study Hub (`/`) is
 * indexable: every other page (history, settings, goals, assessments,
 * dashboard, social, auth) requires an authenticated session, and the timer /
 * stopwatch utilities carry no SEO value. `robots.txt` points here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = new URL(APP_ORIGIN).origin;
  return [
    {
      url: `${origin}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}