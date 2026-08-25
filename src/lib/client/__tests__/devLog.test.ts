import { describe, it, expect, vi, afterEach } from 'vitest';
import { devLog } from '../devLog';

/**
 * The pipeline logger must stay completely silent in production builds and
 * never leak anything beyond aggregate segment/stat numbers (which is all we
 * ever pass it).
 */
describe('devLog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs in non-production environments', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    devLog('study segment acknowledged', { segmentId: 's#1', awardedXp: 3 });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [prefix, event, payload] = logSpy.mock.calls[0];
    expect(prefix).toBe('[studyforge]');
    expect(event).toBe('study segment acknowledged');
    expect(JSON.parse(payload as string)).toEqual({ segmentId: 's#1', awardedXp: 3 });
  });

  it('is silent in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      devLog('authoritative stats received', { totalXp: 8 });
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('works without a payload', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    devLog('page visible — refreshing page data');
    expect(logSpy).toHaveBeenCalledWith('[studyforge]', 'page visible — refreshing page data');
  });
});
