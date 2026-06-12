/**
 * Convert a string into a URL-friendly slug.
 *
 * - Trims leading/trailing whitespace
 * - Lowercases
 * - Replaces whitespace sequences with a single hyphen
 * - Strips all non-alphanumeric characters except hyphens
 * - Collapses three or more consecutive hyphens into one
 *
 * @param {string} str - The input string to slugify.
 * @returns {string} A clean hyphen-separated slug.
 */
export function slugify(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{3,}/g, '-');
}
