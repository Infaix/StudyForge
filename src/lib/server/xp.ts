import { getDB } from '@/lib/db';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * XP Calculation Constants
 * Configurable in one central location.
 */
export const XP_CONFIG = {
  /** XP per verified completed minute of study */
  xpPerMinute: 1,
  /** Minimum duration (seconds) for a session to award XP */
  minDurationSeconds: 60,
  /** Maximum duration (seconds) for a session to award XP */
  maxDurationSeconds: 7200,
  /** Bonus XP for achieving a streak milestone within a session */
  streakBonus: 10,
};

/**
 * Get the authenticated user ID from the request session.
 * Returns null if not authenticated.
 */
export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const { env } = getCloudflareContext();
  const db = env.DATABASE;

  // Try to get user from session cookie
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((c) => {
    const eqIdx = c.indexOf('=');
    if (eqIdx === -1) return;
    const key = c.substring(0, eqIdx).trim();
    const val = c.substring(eqIdx + 1).trim();
    cookies[key] = val;
  });

  const token = cookies['studyforge-session'];
  if (!token) return null;

  // Verify the session token
  try {
    const secret = process.env.JWT_SECRET || 'studyforge-dev-secret-change-in-production';
    const { jwtVerify } = await import('jose');
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload.userId as string;
  } catch {
    return null;
  }
}

/**
 * Calculate XP from a study session duration.
 * Uses the centralized XP_CONFIG so the formula is in one place.
 * 
 * Formula: base XP (1 per minute) + bonus for longer sessions
 * Bonus: +1 XP every 30 minutes studied
 * This rewards longer study sessions without creating a cap.
 */
export function calculateXpFromDuration(durationSeconds: number): number {
  const minutes = Math.floor(durationSeconds / 60);

  if (minutes <= 0) return 0;

  // Base XP: 1 XP per completed minute
  // Bonus: +1 XP every 30 minutes studied (rewards longer sessions)
  const bonusXp = Math.floor(minutes / 30);
  
  return minutes + bonusXp;
}

/**
 * Calculate level from total XP.
 * Scales XP requirement per level to avoid requiring the same amount forever.
 * Level 1: 0 XP
 * Level 2: 100 XP
 * Level 3: 200 XP
 * Level 4: 350 XP
 * Level 5: 550 XP
 * Level 6: 800 XP
 * etc. (accelerating curve)
 *
 * Formula: each level requires 100 * (1 + 2 + ... + (N-1)) XP
 * This ensures progression gets harder at higher levels
 */
export function getLevelFromXp(totalXp: number): number {
  if (totalXp <= 0) return 1;

  // Use a smooth progression: level N requires 100 * (1 + 2 + ... + (N-1)) XP
  // Level 1: 0-99 XP
  // Level 2: 100-249 XP
  // Level 3: 250-499 XP
  // Level 4: 500-849 XP
  // Level 5: 850-1349 XP
  // etc.
  let level = 1;
  let xpForCurrentLevel = 0;

  while (true) {
    const xpNeededForNextLevel = 100 * level;
    if (totalXp < xpForCurrentLevel + xpNeededForNextLevel) {
      return level;
    }
    level++;
    xpForCurrentLevel += xpNeededForNextLevel;
  }
}

/**
 * Calculate progress to next level.
 * Returns: { currentLevel, currentXp, xpForNextLevel, progressPercent }
 */
export function getLevelProgress(totalXp: number): {
  currentLevel: number;
  currentXp: number;
  xpForNextLevel: number;
  progressPercent: number;
} {
  if (totalXp <= 0) {
    return { currentLevel: 1, currentXp: 0, xpForNextLevel: 100, progressPercent: 0 };
  }

  let level = 1;
  let xpForCurrentLevel = 0;

  while (true) {
    const xpNeededForNextLevel = 100 * level;
    if (totalXp < xpForCurrentLevel + xpNeededForNextLevel) {
      const levelXp = totalXp - xpForCurrentLevel;
      const progress = (levelXp / xpNeededForNextLevel) * 100;
      return {
        currentLevel: level,
        currentXp: levelXp,
        xpForNextLevel: xpNeededForNextLevel,
        progressPercent: Math.min(100, Math.max(0, progress)),
      };
    }
    level++;
    xpForCurrentLevel += xpNeededForNextLevel;
  }
}

/**
 * Award XP to a user atomically.
 * Prevents duplicate XP for the same event.
 *
 * Returns: { newTotalXp, newLevel, leveledUp, transactionId }
 */
export async function awardXpAtomically(
  request: Request,
  amount: number,
  reason: string,
  relatedId: string | null = null,
  eventType: 'study_session' | 'achievement' = 'study_session'
): Promise<{ newTotalXp: number; newLevel: number; leveledUp: boolean; transactionId: string }> {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    throw new Error('Unauthenticated');
  }

  const db = getDB();
  const transactionId = crypto.randomUUID();

  // Use a transaction-like approach: insert XP transaction with idempotency check
  // First, check if we've already awarded XP for this specific event
  const existingTransaction = await db.prepare(
    'SELECT id FROM xp_transactions WHERE user_id = ? AND related_id = ? AND reason = ? AND event_type = ?'
  ).bind(userId, relatedId, reason, eventType).first();

  if (existingTransaction) {
    // XP already awarded for this event - fetch current state and return
    const profile = await db.prepare(
      'SELECT xp, level FROM user_profiles WHERE user_id = ?'
    ).bind(userId).first();

    const currentXp = (profile?.xp as number) || 0;
    const currentLevel = (profile?.level as number) || 1;

    return {
      newTotalXp: currentXp,
      newLevel: currentLevel,
      leveledUp: false,
      transactionId,
    };
  }

  // Insert the XP transaction
  await db.prepare(
    'INSERT INTO xp_transactions (id, user_id, amount, reason, related_id, event_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(transactionId, userId, amount, reason, relatedId, eventType, new Date().toISOString()).run();

  // Update user's total XP and level
  const newTotalXp = (await getCurrentXp(userId))!.xp + amount;
  const newLevel = getLevelFromXp(newTotalXp);

  await db.prepare(
    'UPDATE user_profiles SET xp = ?, level = ?, updated_at = ? WHERE user_id = ?'
  ).bind(newTotalXp, newLevel, new Date().toISOString(), userId).run();

  // Check if leveled up
  const profileBefore = await db.prepare(
    'SELECT level FROM user_profiles WHERE user_id = ?'
  ).bind(userId).first();
  const levelBefore = (profileBefore?.level as number) || 1;
  const leveledUp = newLevel > levelBefore;

  if (leveledUp) {
    // Level-up handled by caller
  }

  return {
    newTotalXp,
    newLevel,
    leveledUp,
    transactionId,
  };
}

/**
 * Get current XP for a user from D1.
 */
export async function getCurrentXp(userId: string): Promise<{ xp: number; level: number }> {
  const db = getDB();
  const profile = await db.prepare(
    'SELECT xp, level FROM user_profiles WHERE user_id = ?'
  ).bind(userId).first();

  const xp = (profile?.xp as number) || 0;
  const level = (profile?.level as number) || 1;

  return { xp, level };
}

/**
 * Validate a study session before awarding XP.
 * Returns validation result or error message.
 */
export function validateStudySession({
  durationSeconds,
  subjectId,
  sessionType = 'study_session',
}: {
  durationSeconds: number;
  subjectId?: string;
  sessionType?: string;
}): { valid: boolean; error?: string } {
  if (durationSeconds <= 0) {
    return { valid: false, error: 'Duration must be positive' };
  }

  if (durationSeconds < XP_CONFIG.minDurationSeconds) {
    return { valid: false, error: `Minimum session duration is ${XP_CONFIG.minDurationSeconds / 60} minute(s)` };
  }

  if (durationSeconds > XP_CONFIG.maxDurationSeconds) {
    return { valid: false, error: `Maximum session duration is ${XP_CONFIG.maxDurationSeconds / 60} hour(s)` };
  }

  if (durationSeconds > 7200 && sessionType !== 'custom') {
    return { valid: false, error: 'Session too long for automatic type' };
  }

  return { valid: true };
}

/**
 * Get XP history for a user.
 */
export async function getXpHistory(userId: string, limit: number = 20): Promise<Array<{
  id: string;
  amount: number;
  reason: string;
  relatedId: string | null;
  createdAt: string;
}>> {
  const db = getDB();
  const { results } = await db.prepare(
    'SELECT * FROM xp_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(userId).all<{ id: string; amount: number; reason: string; related_id: string; created_at: string }>();

  return results.map((r) => ({
    id: r.id,
    amount: r.amount,
    reason: r.reason,
    relatedId: r.related_id,
    createdAt: r.created_at,
  }));
}

/**
 * Calculate streak information for a user based on their study sessions.
 * Calculates current streak, longest streak, last study date, and total study days.
 */
export async function getStreakInfo(userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  totalStudyDays: number;
  daysSinceLastStudy: number;
}> {
  const db = getDB();

  // Get all study sessions for this user, ordered by start time
  const { results } = await db.prepare(
    'SELECT id, user_id, duration, start_time, end_time FROM study_sessions WHERE user_id = ? ORDER BY start_time ASC'
  ).bind(userId).all<{ id: string; duration: number; start_time: string; end_time: string }>();

  if (!results || results.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: null,
      totalStudyDays: 0,
      daysSinceLastStudy: 9999,
    };
  }

  // Get unique study days (deduplicated by date)
  const uniqueDatesSet = new Set<string>();
  for (const session of results) {
    const dateKey = new Date(session.start_time).toISOString().split('T')[0];
    uniqueDatesSet.add(dateKey);
  }

  const uniqueDates = Array.from(uniqueDatesSet).sort();
  const totalStudyDays = uniqueDates.length;

  if (uniqueDates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: null,
      totalStudyDays: 0,
      daysSinceLastStudy: 9999,
    };
  }

  // Calculate last study date (most recent)
  const lastStudyDate = uniqueDates[uniqueDates.length - 1];

  // Calculate days since last study
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastStudy = new Date(lastStudyDate);
  lastStudy.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - lastStudy.getTime();
  const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const daysSinceLastStudy = diffDays;

  // Calculate streaks (longest consecutive study days)
  // Sort dates and find longest run of consecutive days
  let longestStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < uniqueDates.length; i++) {
    const prevDate = new Date(uniqueDates[i - 1]);
    const currDate = new Date(uniqueDates[i]);
    
    // Set to start of day for comparison
    prevDate.setHours(0, 0, 0, 0);
    currDate.setHours(0, 0, 0, 0);
    
    const diff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (diff === 1) {
      // Consecutive day
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else if (diff > 1) {
      // Gap - streak broken
      currentStreak = 1;
    }
    // if diff <= 0, it's the same day or earlier, skip
  }

  // Calculate current streak (from today backwards)
  let currentStreakValue = 0;
  
  // Check how many consecutive days ending with today have study sessions
  const todayKey = today.toISOString().split('T')[0];
  
  // Walk backwards from today
  let checkedDays = 0;
  for (let i = uniqueDates.length - 1; i >= 0; i--) {
    const dateKey = uniqueDates[i];
    
    if (dateKey === todayKey) {
      currentStreakValue = 1;
      checkedDays++;
    } else if (dateKey < todayKey) {
      // Check if this is exactly one day before the previous checked day
      const checkedDate = new Date(today);
      checkedDate.setDate(checkedDate.getDate() - checkedDays);
      checkedDate.setHours(0, 0, 0, 0);
      const checkedKey = checkedDate.toISOString().split('T')[0];
      
      if (dateKey === checkedKey) {
        currentStreakValue = checkedDays + 1;
        checkedDays++;
      } else if (parseInt(dateKey.replace(/-/g, '')) < parseInt(checkedKey.replace(/-/g, ''))) {
        // Gap detected - streak ends
        break;
      }
    } else {
      // Future date, stop
      break;
    }
  }

  // If no session today, check from yesterday backwards
  if (currentStreakValue === 0) {
    // Check how many consecutive days ending yesterday have sessions
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayKey = yesterday.toISOString().split('T')[0];
    
    let streakFromYesterday = 0;
    let daysChecked = 0;
    
    for (let i = uniqueDates.length - 1; i >= 0; i--) {
      const dateKey = uniqueDates[i];
      
      if (dateKey === yesterdayKey) {
        streakFromYesterday = 1;
        daysChecked = 1;
      } else if (dateKey < yesterdayKey) {
        const prevDate = new Date(today);
        prevDate.setDate(prevDate.getDate() - daysChecked - 1);
        prevDate.setHours(0, 0, 0, 0);
        const prevKey = prevDate.toISOString().split('T')[0];
        
        if (dateKey === prevKey) {
          streakFromYesterday = daysChecked + 1;
          daysChecked++;
        } else if (parseInt(dateKey.replace(/-/g, '')) < parseInt(prevKey.replace(/-/g, ''))) {
          break;
        }
      } else {
        break;
      }
    }
    
    currentStreakValue = streakFromYesterday;
  }

  // Make sure longestStreak is at least 1 if there are any study days
  if (totalStudyDays > 0 && longestStreak < 1) {
    longestStreak = 1;
  }

  return {
    currentStreak: currentStreakValue,
    longestStreak,
    lastStudyDate,
    totalStudyDays,
    daysSinceLastStudy,
  };
};

/**
 * Award an achievement to a user.
 * Only awards if the user hasn't already unlocked it.
 *
 * Returns: { unlocked: boolean, achievement, newTotalXp, newLevel }
 */
export async function awardAchievement(
  request: Request,
  achievementKey: string,
  achievementName: string,
  description: string,
  icon: string,
  requirement: string,
  rewardXp: number
): Promise<{ unlocked: boolean; achievement: any; newTotalXp: number; newLevel: number }> {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    throw new Error('Unauthenticated');
  }

  const db = getDB();

  // Check if user already has this achievement
  const existing = await db.prepare(
    'SELECT id FROM user_achievements WHERE user_id = ? AND achievement_id = ?'
  ).bind(userId, achievementKey).first();

  if (existing) {
    // Already unlocked - return current state
    const profile = await db.prepare(
      'SELECT xp, level FROM user_profiles WHERE user_id = ?'
    ).bind(userId).first<{ xp: number; level: number }>();

    return {
      unlocked: false,
      achievement: { key: achievementKey, name: achievementName, description, icon, requirement, rewardXp },
      newTotalXp: profile?.xp ?? 0,
      newLevel: profile?.level ?? 1,
    };
  }

  // Award the achievement
  const now = new Date().toISOString();
  const achievementId = crypto.randomUUID();

  await db.prepare(
    'INSERT INTO user_achievements (id, user_id, achievement_id, unlockedAt) VALUES (?, ?, ?, ?)'
  ).bind(achievementId, userId, achievementKey, now).run();

  // Award XP for the achievement
  const { newTotalXp, newLevel, leveledUp } = await awardXpAtomically(
    request,
    rewardXp,
    `Achievement unlocked: ${achievementName}`,
    achievementKey,
    'achievement'
  );

  // Generate notification and activity for achievement unlock
  // This is handled by the caller

  return {
    unlocked: true,
    achievement: { key: achievementKey, name: achievementName, description, icon, requirement, rewardXp },
    newTotalXp,
    newLevel,
  };
}