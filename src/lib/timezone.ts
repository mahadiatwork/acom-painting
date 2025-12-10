/**
 * Timezone utilities for Zoho CRM DateTime formatting
 * Zoho requires DateTime fields in format: 2020-12-09T17:25:24-07:00
 */

/**
 * Gets the user's timezone offset in format required by Zoho
 * Returns: "-07:00" or "+05:30" format
 * 
 * @returns Timezone offset string in format required by Zoho CRM
 */
export function getUserTimezoneOffset(): string {
  const date = new Date();
  const offset = -date.getTimezoneOffset(); // Note: negative because getTimezoneOffset returns opposite
  
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  const sign = offset >= 0 ? '+' : '-';
  
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

