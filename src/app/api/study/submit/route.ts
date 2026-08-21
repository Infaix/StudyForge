import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getAuthenticatedUserId } from '@/lib/server/xp';
import { awardXpAtomically, calculateXpFromDuration, XP_CONFIG } from '@/lib/server/xp';

interface SubmitStudyBody {
  durationSeconds: number;
  subjectId?: string;
  subjectName?: string;
  timerType: 'pomodoro' | 'countdown' | 'stopwatch' | 'other';
  sessionId?: string;
  startedAt?: string;
}

interface SubmitStudyStats {
  totalStudySeconds: number;
  xp: number;
  level: number;
}

interface SubmitStudyResponse {
  success: boolean;
  session: {
    id: string;
    durationSeconds: number;
    xpEarned: number;
  };
  stats: SubmitStudyStats;
  duplicate: boolean;
}

/**
 * Study time submission endpoint.
 * 
 * This endpoint:
 * 1. Authenticates the user using the existing StudyForge authentication system.
 * 2. Validates the request body.
 * 3. Validates the duration.
 * 4. Calculates XP server-side (never trusts client-provided XP).
 * 5. Creates the study-session record in D1.
 * 6. Updates the user's cumulative statistics.
 * 7. Updates XP and level.
 * 8. Returns the updated statistics.
 * 
 * All timers (Pomodoro, Countdown, Stopwatch) must use this shared endpoint.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Sign in to save your study time and earn XP' },
        { status: 401 }
      );
    }

    const body: SubmitStudyBody = await request.json();

    // Validate required fields
    if (body.durationSeconds === undefined || body.durationSeconds === null || body.durationSeconds <= 0) {
      return NextResponse.json(
        { success: false, error: 'Valid duration is required' },
        { status: 400 }
      );
    }

    if (!body.timerType) {
      return NextResponse.json(
        { success: false, error: 'Timer type is required' },
        { status: 400 }
      );
    }

    const durationSeconds = typeof body.durationSeconds === 'number' ? body.durationSeconds : Math.floor(parseInt(String(body.durationSeconds)));

    // Validate minimum duration
    if (durationSeconds < XP_CONFIG.minDurationSeconds) {
      return NextResponse.json(
        { success: false, error: `Minimum session duration is ${XP_CONFIG.minDurationSeconds / 60} minute(s)` },
        { status: 400 }
      );
    }

    // Calculate XP server-side from actual submitted study time
    // Uses the central calculateXpFromDuration function
    const xpAmount = calculateXpFromDuration(durationSeconds);

    // Check for duplicate submission using the session ID
    const { env } = getCloudflareContext();
    const db = env.DATABASE;
    const sessionId = body.sessionId || crypto.randomUUID();

    // Check if XP was already awarded for this session
    const existingTxn = await db.prepare(
      'SELECT id FROM xp_transactions WHERE user_id = ? AND related_id = ? AND event_type = ?'
    ).bind(userId, sessionId, 'study_session').first<{ id: string }>();

    if (existingTxn) {
      // XP already awarded - return existing state
      const profile = await db.prepare(
        'SELECT xp, level FROM user_profiles WHERE user_id = ?'
      ).bind(userId).first<{ xp: number; level: number }>();

      const currentXp = profile?.xp ?? 0;
      const currentLevel = profile?.level ?? 1;

      // Get current study stats from D1
      const statsRes = await db.prepare(
        'SELECT study_time_all_time as totalStudySeconds, xp, level FROM user_profiles WHERE user_id = ?'
      ).bind(userId).first<{ totalStudySeconds: number; xp: number; level: number }>();

      const totalStudySeconds = statsRes?.totalStudySeconds ?? 0;

      return NextResponse.json({
        success: true,
        session: {
          id: sessionId,
          durationSeconds,
          xpEarned: 0, // No additional XP since already awarded
        },
        stats: {
          totalStudySeconds,
          xp: currentXp,
          level: currentLevel,
        },
        duplicate: true,
      } as SubmitStudyResponse);
    }

    // Ensure the study session exists in D1
    const sessionExists = await db.prepare(
      'SELECT id FROM study_sessions WHERE id = ?'
    ).bind(sessionId).first<{ id: string }>();

    if (!sessionExists) {
      const now = new Date().toISOString();
      const startTime = body.startedAt || new Date(Date.now() - durationSeconds * 1000).toISOString();

      await db.prepare(
        'INSERT INTO study_sessions (id, user_id, subject_id, duration, start_time, end_time, notes, session_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(sessionId, userId, body.subjectId || null, durationSeconds, startTime, now, `Timer type: ${body.timerType}`, body.timerType).run();
    }

    // Award XP atomically
    const { newTotalXp, newLevel, leveledUp, transactionId } = await awardXpAtomically(
      request,
      xpAmount,
      `Completed ${durationSeconds} second study session (${body.timerType})`,
      sessionId,
      'study_session'
    );

    // Get updated stats
    const statsRes = await db.prepare(
      'SELECT study_time_all_time as totalStudySeconds, xp, level FROM user_profiles WHERE user_id = ?'
    ).bind(userId).first<{ totalStudySeconds: number; xp: number; level: number }>();

    const totalStudySeconds = statsRes?.totalStudySeconds ?? 0;

    return NextResponse.json({
      success: true,
      session: {
        id: sessionId,
        durationSeconds,
        xpEarned: xpAmount,
      },
      stats: {
        totalStudySeconds,
        xp: newTotalXp,
        level: newLevel,
      },
      duplicate: false,
    } as SubmitStudyResponse);
  } catch (error: any) {
    console.error('Study submission error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to submit study time' },
      { status: 500 }
    );
  }
}