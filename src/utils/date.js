export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date (UTC) as YYYY-MM-DD. */
export const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * The latest "today" anywhere on Earth (UTC+14), so a user ahead of the server's
 * timezone isn't told their date is in the future.
 */
export const latestTodayIso = () => new Date(Date.now() + 14 * 3600 * 1000).toISOString().slice(0, 10);
