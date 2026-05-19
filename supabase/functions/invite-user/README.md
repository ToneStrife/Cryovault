# invite-user

Envía invitaciones por email y reenvía enlaces mágicos para invitaciones pendientes.

## Acciones (`body.action`)

| Acción | Descripción |
|--------|-------------|
| `invite` (default) | `inviteUserByEmail` + fila en `invites` |
| `resend` | `signInWithOtp` (magic link) para email con invitación pendiente |

## Secrets

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_SITE_URL` — origen del sitio sin barra final, p. ej. `https://tonestrife.github.io`

## Redirect URLs (Supabase Dashboard)

Ver [docs/INVITE_SETUP.md](../../../docs/INVITE_SETUP.md).

Redeploy: `supabase functions deploy invite-user`
