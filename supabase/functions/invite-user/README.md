# invite-user

Sends real Supabase Auth invitation emails and records the invitation in `invites`.

Required secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Supabase Auth must have email delivery enabled, either through the project default emails or a configured SMTP provider.
