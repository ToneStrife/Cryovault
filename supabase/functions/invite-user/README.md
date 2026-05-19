# invite-user

Sends real Supabase Auth invitation emails and records the invitation in `invites`.

Required secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Supabase Auth must have email delivery enabled, either through the project default emails or a configured SMTP provider.

## Redirect URLs (Supabase Dashboard)

In **Authentication → URL Configuration**:

- **Site URL**: `https://<your-domain>/Cryovault/` (or `http://localhost:5173/Cryovault/` for local dev)
- **Redirect URLs** (add all that apply):
  - `http://localhost:5173/Cryovault/accept-invite`
  - `http://localhost:5174/Cryovault/accept-invite`
  - `http://localhost:5175/Cryovault/accept-invite`
  - `https://<your-domain>/Cryovault/accept-invite`

Invitations redirect to `/Cryovault/accept-invite` so the user can set their password.

Redeploy after changing this function: `supabase functions deploy invite-user`
