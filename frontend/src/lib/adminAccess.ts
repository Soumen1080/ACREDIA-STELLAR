const TRUSTED_ADMIN_ENV_VARS = ['ADMIN_EMAIL_ALLOWLIST', 'SUPABASE_SERVICE_ROLE_KEY'];

export function adminSetupRequirements() {
    return TRUSTED_ADMIN_ENV_VARS;
}

// `normalizePublicSignupRole` was removed with public signup (Issue #239).
// A role is no longer something a user can assert about themselves at account
// creation: it is set by whoever provisioned the account, so there is nothing
// left to clamp.
