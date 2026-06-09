# invite-user

Crea usuarios con contraseña provisional y opcionalmente envía credenciales por SMTP.

## Acciones (`body.action`)

| Acción | Descripción |
|--------|-------------|
| `create` (default) | Inserta en `invites` + `auth.admin.createUser` + email opcional |
| `reset_credentials` | Nueva contraseña provisional para usuario pendiente de activación |
| `revoke` | Elimina invitación pendiente y usuario de Auth si existe |

## Secrets

| Secret | Descripción |
|--------|-------------|
| `SUPABASE_URL` | (automático al desplegar) |
| `SUPABASE_ANON_KEY` | (automático) |
| `SUPABASE_SERVICE_ROLE_KEY` | (automático) |
| `PUBLIC_SITE_URL` | `https://tonestrife.github.io` |
| `SMTP_HOST` | Mismo host que Auth → SMTP en Supabase Dashboard |
| `SMTP_PORT` | `465` o `587` |
| `SMTP_USER` | Usuario SMTP |
| `SMTP_PASSWORD` | Contraseña SMTP |
| `SMTP_FROM` | Remitente (ej. `noreply@tudominio.es`) |

## Ejemplo `create`

```json
{
  "action": "create",
  "email": "usuario@lab.es",
  "role": "researcher",
  "laboratory": "mi_lab",
  "password": "TempPass123",
  "send_email": true
}
```
