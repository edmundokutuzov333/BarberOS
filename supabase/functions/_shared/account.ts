export type AccountAccessFailure = {
  code: 'ACCOUNT_STATE_UNAVAILABLE' | 'PASSWORD_CHANGE_REQUIRED';
  status: 503 | 403;
};

/** Accept only a profile read through the trusted server client. Never pass JWT
 * user_metadata or a request payload as the authoritative profile. */
export function accountAccessFailure(
  profile: unknown,
  options: { databaseError?: boolean; allowRequiredPasswordChange?: boolean } = {},
): AccountAccessFailure | null {
  if (options.databaseError || !profile || typeof profile !== 'object' || Array.isArray(profile)
    || !('password_change_required' in profile) || typeof profile.password_change_required !== 'boolean') {
    return { code: 'ACCOUNT_STATE_UNAVAILABLE', status: 503 };
  }
  if (profile.password_change_required && !options.allowRequiredPasswordChange) {
    return { code: 'PASSWORD_CHANGE_REQUIRED', status: 403 };
  }
  return null;
}
