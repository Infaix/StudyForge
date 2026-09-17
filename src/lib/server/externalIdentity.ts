import { getDB } from '@/lib/db';

export interface ExternalIdentityLink {
  provider: string;
  externalUserId: string;
  studyUserId: string;
  createdAt: string;
}

/** Look up a previously verified external identity without merging accounts. */
export async function findExternalIdentity(provider: string, externalUserId: string): Promise<ExternalIdentityLink | null> {
  const row = await getDB().prepare(`SELECT provider, external_user_id, study_user_id, created_at FROM external_identities WHERE provider = ? AND external_user_id = ?`).bind(provider, externalUserId).first<{ provider: string; external_user_id: string; study_user_id: string; created_at: string }>();
  return row ? { provider: row.provider, externalUserId: row.external_user_id, studyUserId: row.study_user_id, createdAt: row.created_at } : null;
}

/** Create a link only after a trusted provider has authenticated both sides. */
export async function linkExternalIdentity(provider: string, externalUserId: string, studyUserId: string): Promise<ExternalIdentityLink> {
  if (!provider || !externalUserId || !studyUserId) throw new Error('All identity link fields are required');
  const createdAt = new Date().toISOString();
  await getDB().prepare(`INSERT INTO external_identities (provider, external_user_id, study_user_id, created_at) VALUES (?, ?, ?, ?)`).bind(provider, externalUserId, studyUserId, createdAt).run();
  return { provider, externalUserId, studyUserId, createdAt };
}
