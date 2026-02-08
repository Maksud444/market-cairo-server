/**
 * Content filtering utility for personal information
 * Filters: phone numbers, emails, URLs, social media handles
 */

const PATTERNS = {
  // Egyptian phone numbers: 01XXXXXXXXX, +201XXXXXXXXX, 00201XXXXXXXXX
  phoneNumbers: [
    /\b0?1[0125]\d{8}\b/g,                          // 01XXXXXXXXX
    /\b(\+?20|0020)\s?1[0125]\s?\d{3,4}\s?\d{4}\b/g, // +20 1X XXXX XXXX
    /\b\d{4}\s?\d{3}\s?\d{4}\b/g,                   // Generic: XXXX XXX XXXX
  ],

  // Email addresses
  emails: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  // URLs and domains
  urls: [
    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
    /\bwww\.[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
    /\b[a-zA-Z0-9-]+\.(com|net|org|info|eg|me|io|co|online|site)\b/gi,
  ],

  // Social media handles
  socialMedia: [
    /@[a-zA-Z0-9_]{3,}/g,                          // @username
    /\b(facebook|fb|whatsapp|wa|telegram|tg|instagram|insta|twitter|tiktok)\.com\/[a-zA-Z0-9._-]+/gi,
    /\b(facebook|fb|whatsapp|wa|telegram|instagram|insta):\s?[a-zA-Z0-9._-]+/gi,
  ],

  // Variations of "call me", "message me" with phone patterns
  contactPrompts: [
    /\b(call|text|message|whatsapp|wa|telegram)\s+(me|m)\s+(on|at|@)?\s*:?\s*\d{4,}/gi,
  ],
};

/**
 * Filter personal information from text
 * @param {String} text - Input text
 * @param {Object} options - Filtering options
 * @returns {Object} - { filtered: String, hasFiltered: Boolean, matches: Array }
 */
function filterPersonalInfo(text, options = {}) {
  const {
    replacement = '[HIDDEN]',
    preserveLength = false,
    returnMatches = false,
  } = options;

  let filtered = text;
  let hasFiltered = false;
  const matches = {};

  // Filter phone numbers
  PATTERNS.phoneNumbers.forEach((pattern, index) => {
    const found = text.match(pattern);
    if (found && found.length > 0) {
      if (returnMatches) {
        matches[`phone_${index}`] = found;
      }
      filtered = filtered.replace(pattern, replacement);
      hasFiltered = true;
    }
  });

  // Filter emails
  const emailMatches = text.match(PATTERNS.emails);
  if (emailMatches && emailMatches.length > 0) {
    if (returnMatches) {
      matches.emails = emailMatches;
    }
    filtered = filtered.replace(PATTERNS.emails, replacement);
    hasFiltered = true;
  }

  // Filter URLs
  PATTERNS.urls.forEach((pattern, index) => {
    const found = text.match(pattern);
    if (found && found.length > 0) {
      if (returnMatches) {
        matches[`url_${index}`] = found;
      }
      filtered = filtered.replace(pattern, replacement);
      hasFiltered = true;
    }
  });

  // Filter social media
  PATTERNS.socialMedia.forEach((pattern, index) => {
    const found = text.match(pattern);
    if (found && found.length > 0) {
      if (returnMatches) {
        matches[`social_${index}`] = found;
      }
      filtered = filtered.replace(pattern, replacement);
      hasFiltered = true;
    }
  });

  // Filter contact prompts
  PATTERNS.contactPrompts.forEach((pattern, index) => {
    const found = text.match(pattern);
    if (found && found.length > 0) {
      if (returnMatches) {
        matches[`contact_${index}`] = found;
      }
      filtered = filtered.replace(pattern, replacement);
      hasFiltered = true;
    }
  });

  return {
    filtered,
    hasFiltered,
    matches: returnMatches ? matches : undefined,
  };
}

/**
 * Check if text contains personal information (without filtering)
 */
function containsPersonalInfo(text) {
  const result = filterPersonalInfo(text, { returnMatches: true });
  return result.hasFiltered;
}

/**
 * Get statistics about filtered content
 */
function getFilterStats(text) {
  const result = filterPersonalInfo(text, { returnMatches: true });

  return {
    hasPersonalInfo: result.hasFiltered,
    types: Object.keys(result.matches || {}),
    count: Object.values(result.matches || {}).reduce((sum, arr) => sum + arr.length, 0),
    matches: result.matches,
  };
}

module.exports = {
  filterPersonalInfo,
  containsPersonalInfo,
  getFilterStats,
  PATTERNS, // Export for testing/customization
};
