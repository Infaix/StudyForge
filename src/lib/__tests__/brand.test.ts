import { describe, it, expect } from 'vitest';
import {
  BRAND_NAME,
  PRODUCT_NAME,
  APP_NAME,
  APP_ORIGIN,
  APP_TAGLINE,
  APP_DESCRIPTION,
  EXPORT_FILE_PREFIX,
} from '../brand';

describe('INFAIX Study brand constants', () => {
  it('names the product INFAIX Study', () => {
    expect(BRAND_NAME).toBe('INFAIX');
    expect(PRODUCT_NAME).toBe('Study');
    expect(APP_NAME).toBe('INFAIX Study');
  });

  it('points at the canonical study.infaix.com origin', () => {
    expect(APP_ORIGIN).toBe('https://study.infaix.com');
    expect(APP_ORIGIN.toLowerCase()).not.toContain('studyforge');
  });

  it('provides public marketing copy', () => {
    expect(APP_TAGLINE.length).toBeGreaterThan(0);
    expect(APP_DESCRIPTION.length).toBeGreaterThan(0);
    expect(APP_DESCRIPTION.toLowerCase()).not.toContain('studyforge');
  });

  it('uses a branded export filename prefix', () => {
    expect(EXPORT_FILE_PREFIX).toBe('infaix-study-export');
  });
});