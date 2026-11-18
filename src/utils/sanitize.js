/** Trimmed string capped at `max` characters; anything that isn't a string becomes ''. */
export const cleanString = (value, max = 5000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Positive integer id, or null. */
export function toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Escapes text for safe use inside a RegExp. */
export const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Multi-line text with normalised line endings and no trailing spaces. */
export const cleanMultiline = text =>
  (text || '').replace(/\r\n?/g, '\n').split('\n').map(line => line.trimEnd()).join('\n').trim();
