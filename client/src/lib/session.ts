/**
 * Demo identity. Authentication is out of scope for the MVP, so the acting
 * user's name is sent explicitly with each mutation and recorded in the
 * audit trail. Replace with the authenticated user once auth is added.
 */
export const CURRENT_USER = {
  name: 'Demo User',
  initials: 'DU',
  role: 'Finance Manager',
} as const;
