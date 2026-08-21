import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getAuthenticatedUserId } from '@/lib/server/xp';
import { awardXpAtomically, getStreakInfo, XP_CONFIG } from '@/lib/server/xp';

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

interface CompleteStudySessionBody {
  duration: number;
  subjectId?: string;
  sessionId?: string;
  notes?: string;
  startTime?: string;
}

interface CompleteStudySessionResponse {
  xp: number;
  level: number;
  leveledUp: boolean;
  sessionId: string;
  duplicate: boolean;
  streakInfo?: {
    currentStreak: number;
    longestStreak: number;
    totalStudyDays: number;
    daysSinceLastStudy: number;
  };
}

/**
 * Study session completion endpoint.
 * 
 * This endpoint:
 * 1. Requires an authenticated user.
 * 2. Validates the submitted study-session information.
 * 3. Determines the authenticated user's ID from the server-side session.
 * 4. Never trusts a client-provided userId.
 * 5. Validates the actual study duration.
 * 6. Rejects obviously manipulated/invalid durations.
 * 7. Persists the completed study session to D1.
 * 8. Calculates XP on the server.
 * 9. Awards XP atomically (prevents duplicate awards).
 * 10. Updates streak information.
 * 11. Returns the completed session and updated XP/level/streak information.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const body: CompleteStudySessionBody = await request.json();

    if (body.duration === undefined || body.duration === null) {
      return NextResponse.json({ error: 'Duration is required' }, { status: 400 });
    }

    const durationSeconds = typeof body.duration === 'number' ? body.duration : Math.floor(parseInt(String(body.duration)));

    // Inline validation of study session
    let validationError: string | undefined;

    if (durationSeconds <= 0) {
      validationError = 'Duration must be positive';
    } else if (durationSeconds < XP_CONFIG.minDurationSeconds) {
      validationError = `Minimum session duration is ${XP_CONFIG.minDurationSeconds / 60} minute(s)`;
    } else if (durationSeconds > XP_CONFIG.maxDurationSeconds) {
      validationError = `Maximum session duration is ${XP_CONFIG.maxDurationSeconds / 60} hour(s)`;
    } else if (durationSeconds > 7200) {
      validationError = 'Session too long for automatic type';
    }

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Check for duplicate XP awarding for the same session
    const { env } = getCloudflareContext();
    const db = env.DATABASE;

    // Check if XP was already awarded for this session
    const sessionId = body.sessionId || generateId('session');
    const existingTxn = await db.prepare(
      'SELECT id FROM xp_transactions WHERE user_id = ? AND related_id = ? AND event_type = ?'
    ).bind(userId, sessionId, 'study_session').first<{ id: string }>();

    if (existingTxn) {
      // XP already awarded - return current state
      const profile = await db.prepare(
        'SELECT xp, level FROM user_profiles WHERE user_id = ?'
      ).bind(userId).first<{ xp: number; level: number }>();

      const currentXp = profile?.xp ?? 0;
      const currentLevel = profile?.level ?? 1;

      const streakInfo = await getStreakInfo(userId);

      return NextResponse.json({
        xp: currentXp,
        level: currentLevel,
        leveledUp: false,
        sessionId,
        duplicate: true,
        streakInfo,
      } as CompleteStudySessionResponse);
    }

    // Ensure the study session exists in D1
    const sessionExists = await db.prepare(
      'SELECT id FROM study_sessions WHERE id = ?'
    ).bind(sessionId).first<{ id: string }>();

    if (!sessionExists) {
      const now = new Date().toISOString();
      await db.prepare(
        'INSERT INTO study_sessions (id, user_id, subject_id, duration, start_time, end_time, notes, session_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(sessionId, userId, body.subjectId || null, durationSeconds, body.startTime || now, now, body.notes || null, 'study_session').run();
    }

// Calculate XP from the validated duration
    // 1 XP per completed minute + bonus for longer sessions
    // Bonus: +1 XP every 30 minutes studied
    const minutes = Math.floor(durationSeconds / 60);
    const xpAmount = minutes + Math.floor(minutes / 30);

    // Award XP atomically
    const { newTotalXp, newLevel, leveledUp, transactionId } = await awardXpAtomically(
      request,
      xpAmount,
      `Completed ${durationSeconds} second study session`,
      sessionId,
      'study_session'
    );

    // Get updated streak info
    const streakInfo = await getStreakInfo(userId);

    return NextResponse.json({
      xp: newTotalXp,
      level: newLevel,
      leveledUp,
      sessionId,
      duplicate: false,
      streakInfo,
    } as CompleteStudySessionResponse);
  } catch (error: any) {
    console.error('Study session completion error:', error);
    return NextResponse.json({ error: error.message || 'Failed to complete study session' }, { status: 500 });
  }
}