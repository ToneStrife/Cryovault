# invite-user

Crea usuarios con contraseña provisional. Versión: `provisioned-v2`.

## Acciones (`body.action`)

| Acción | Descripción |
|--------|-------------|
| `create` (default) | `invites` + `auth.admin.createUser` + guarda contraseña + email opcional |
| `get_credentials` | Devuelve contraseña provisional guardada |
| `resend_email` | Reenvía email con la misma contraseña |
| `reset_credentials` | Nueva contraseña provisional |
| `revoke` | Elimina invitación pendiente y usuario Auth |

## Secrets

Ver [docs/INVITE_SETUP.md](../../../docs/INVITE_SETUP.md).

## Despliegue

```bash
supabase db push
supabase functions deploy invite-user
```
