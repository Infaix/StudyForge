/**
 * INFAIX Study brand constants — single source of truth for PUBLIC naming.
 *
 * These strings are user-facing product identity only. Internal identifiers
 * (the `studyforge-*` session cookie, localStorage keys, devLog prefix and
 * the D1 database names/IDs) are migration-sensitive and intentionally keep
 * their historical values — see docs/technical.md.
 */

export const BRAND_NAME = 'INFAIX';
export const PRODUCT_NAME = 'Study';
export const APP_NAME = `${BRAND_NAME} ${PRODUCT_NAME}`;

export const APP_ORIGIN = 'https://study.infaix.com';
export const APP_PATHNAME = 'https://study.infaix.com/';

export const APP_TAGLINE = 'Build better study habits. Master every subject.';
export const APP_DESCRIPTION =
  'The free, student-first platform that helps you organise subjects, track assessments, study effectively, and know exactly what to study next.';

/** Prefix used for the local-data export file on the Settings page. */
export const EXPORT_FILE_PREFIX = 'infaix-study-export';