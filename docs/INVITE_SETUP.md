# Alta de usuarios — configuración

CryoVault solo permite altas por administrador. El flujo es: **admin crea usuario con contraseña provisional** → usuario inicia sesión en `/login` → **cambia contraseña** en el primer acceso → accede al laboratorio.

## Flujo en la app

1. Admin → **Usuarios** → **Crear usuario** → email, contraseña provisional, rol y laboratorio.
2. Opcional: marcar **Enviar credenciales por email** (SMTP).
3. Tras crear, el admin ve las credenciales en pantalla (copiar y compartir).
4. El usuario inicia sesión con email + contraseña provisional.
5. La app redirige a **Cambiar contraseña** (`/accept-invite`).
6. Tras guardar la contraseña definitiva, accede al dashboard.
7. En Usuarios, el usuario deja de aparecer en **pendientes de activación**.

## Edge Function `invite-user`

### Acciones

| Acción | Descripción |
|--------|-------------|
| `create` | Crea usuario en Auth + fila en `invites` + email opcional |
| `reset_credentials` | Nueva contraseña provisional para usuario pendiente |
| `revoke` | Elimina invitación pendiente y usuario de Auth |

### Secrets (Project Settings → Edge Functions)

| Secret | Descripción |
|--------|-------------|
| `SUPABASE_URL` | Automático al desplegar |
| `SUPABASE_ANON_KEY` | Automático |
| `SUPABASE_SERVICE_ROLE_KEY` | Automático |
| `PUBLIC_SITE_URL` | `https://tonestrife.github.io` |
| `SMTP_HOST` | Copiar de Authentication → SMTP en Supabase Dashboard |
| `SMTP_PORT` | `465` o `587` |
| `SMTP_USER` | Usuario SMTP |
| `SMTP_PASSWORD` | Contraseña SMTP |
| `SMTP_FROM` | Remitente (ej. `noreply@tudominio.es`) |

Los valores SMTP deben coincidir con los configurados en **Authentication → SMTP** del proyecto Supabase.

### Despliegue

```bash
supabase db push
supabase functions deploy invite-user
```

## Supabase Dashboard

### Authentication → URL Configuration

| Campo | Valor (producción) |
|-------|-------------------|
| **Site URL** | `https://tonestrife.github.io/Cryovault/` |
| **Redirect URLs** | `https://tonestrife.github.io/Cryovault/accept-invite` |
| | `http://localhost:5173/Cryovault/accept-invite` |

Las redirect URLs de `accept-invite` siguen siendo necesarias para **recuperación de contraseña** (olvidé mi contraseña).

### Email (Auth)

- Activa el proveedor **Email** en Authentication → Providers.
- Configura **SMTP** para correos de recuperación de contraseña.

## Migración `complete_user_onboarding`

La función RPC `complete_user_onboarding()` marca `invites.accepted_at` cuando el usuario completa el cambio de contraseña en el primer acceso. Está en la migración `20260520140000_017_provisioned_users.sql`.

## Checklist de prueba

- [ ] Admin crea usuario sin enviar email → ve credenciales en pantalla.
- [ ] Usuario inicia sesión con contraseña provisional → pantalla «Cambiar contraseña».
- [ ] Usuario guarda contraseña nueva → llega al dashboard.
- [ ] Invitación desaparece de pendientes de activación.
- [ ] Admin crea usuario con «Enviar por email» → correo recibido.
- [ ] «Reenviar credenciales» genera nueva contraseña provisional.
- [ ] «Revocar» elimina usuario pendiente.

## Errores frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| Email no enviado al crear usuario | Secrets SMTP no configurados en Edge Function |
| Invalid login credentials | Contraseña provisional incorrecta o usuario revocado |
| Perfil no asignado | Error en trigger `handle_new_user` (sin invitación/laboratorio) |
| Usuario ya existe | Email duplicado en Auth |
