# Alta de usuarios — configuración

CryoVault solo permite altas por administrador. El flujo es: **admin crea usuario con contraseña provisional** → usuario inicia sesión en `/login` → **cambia contraseña** en el primer acceso → accede al laboratorio.

## Solo GitHub no basta

El push a `main` despliega **solo el frontend** en GitHub Pages (workflow `.github/workflows/deploy.yml`).

La Edge Function y las migraciones SQL **no se despliegan automáticamente**. Si no ejecutas los comandos de Supabase, seguirás recibiendo **enlaces mágicos** del código antiguo y la contraseña provisional del formulario **no funcionará**.

### Opción A — SQL Editor (rápido si no tienes CLI)

1. Abre [Supabase Dashboard](https://supabase.com/dashboard) → tu proyecto → **SQL Editor**.
2. Copia y ejecuta el contenido de [`supabase/scripts/apply-provisioning-migrations.sql`](../supabase/scripts/apply-provisioning-migrations.sql).
3. Espera unos segundos y vuelve a crear el usuario.

Si ves el error *Could not find the 'temporary_password' column of 'invites' in the schema cache*, es porque **falta este paso**.

### Opción B — Supabase CLI

```bash
cd C:\Users\Usuario\Cryovault
npx supabase login
npx supabase link --project-ref yyfthcebyqylhjkrzsph
npx supabase db push
npx supabase functions deploy invite-user
```

Configura secrets en **Dashboard → Edge Functions → invite-user → Secrets** (copiar de Authentication → SMTP):

| Secret | Descripción |
|--------|-------------|
| `SMTP_HOST` | Host SMTP |
| `SMTP_PORT` | `465` o `587` |
| `SMTP_USER` | Usuario SMTP |
| `SMTP_PASSWORD` | Contraseña SMTP |
| `SMTP_FROM` | Remitente |
| `PUBLIC_SITE_URL` | `https://tonestrife.github.io` |

## Flujo en la app

1. Admin → **Usuarios** → **Crear usuario** → email, contraseña provisional, rol y laboratorio.
2. Opcional: marcar **Enviar credenciales por email** (requiere SMTP en la Edge Function).
3. Tras crear, el admin ve las credenciales en pantalla (copiar y compartir).
4. El usuario inicia sesión en `/login` con email + contraseña provisional.
5. La app redirige a **Cambiar contraseña** (`/accept-invite`).
6. Tras guardar la contraseña definitiva, accede al dashboard.

## Recuperación de contraseña (olvidé mi contraseña)

Usa **Authentication → SMTP** en Supabase (independiente del SMTP de la Edge Function).

Redirect URLs necesarias en **Authentication → URL Configuration**:
- `https://tonestrife.github.io/Cryovault/accept-invite`
- `http://localhost:5173/Cryovault/accept-invite`

El flujo envía un enlace a `/accept-invite` con `type=recovery`. Debe abrirse en el **mismo navegador** donde se solicitó.

**Alternativa:** un administrador puede usar **Reset pass** en Usuarios (usuarios activos) o **Nueva contraseña** (pendientes de activación) para generar una contraseña provisional.

## Edge Function `invite-user`

Versión actual del backend: `provisioned-v2`. Si la app muestra aviso de backend desactualizado, redepliega la función.

### Acciones

| Acción | Descripción |
|--------|-------------|
| `create` | Crea usuario en Auth + fila en `invites` + guarda contraseña + email opcional |
| `get_credentials` | Devuelve contraseña provisional guardada (solo pendientes) |
| `resend_email` | Reenvía email con la **misma** contraseña |
| `reset_credentials` | Genera contraseña **nueva**, actualiza Auth y `invites` |
| `admin_reset_password` | Contraseña provisional para usuario **activo** (admin) |
| `revoke` | Elimina invitación pendiente y usuario de Auth |

La contraseña provisional se guarda en `invites.temporary_password` (solo accesible vía Edge Function, no desde el cliente).

## Supabase Dashboard

### Authentication → URL Configuration

| Campo | Valor (producción) |
|-------|-------------------|
| **Site URL** | `https://tonestrife.github.io/Cryovault/` |
| **Redirect URLs** | `https://tonestrife.github.io/Cryovault/accept-invite` |
| | `http://localhost:5173/Cryovault/accept-invite` |

Las redirect URLs de `accept-invite` siguen siendo necesarias para **recuperación de contraseña**.

## Checklist de prueba

- [ ] `supabase db push` y `supabase functions deploy invite-user` ejecutados
- [ ] Admin crea usuario sin email → ve credenciales en pantalla
- [ ] «Ver credenciales» muestra la misma contraseña
- [ ] Usuario inicia sesión en `/login` → pantalla «Cambiar contraseña»
- [ ] «Reenviar email» no cambia la contraseña
- [ ] «Nueva contraseña» sí la cambia y lo indica
- [ ] Correo recibido contiene URL + contraseña (no enlace mágico)

## Errores frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| `temporary_password` column not in schema cache | Ejecutar [`apply-provisioning-migrations.sql`](../supabase/scripts/apply-provisioning-migrations.sql) en SQL Editor |
| Recibo email con enlace para «activar cuenta» | Edge Function **no desplegada** (código viejo en Supabase) |
| Contraseña provisional no funciona | Backend viejo no creó usuario con esa contraseña |
| Email no enviado | Secrets SMTP no configurados en Edge Function |
| «Ver credenciales» falla | Usuario creado con flujo viejo (sin contraseña guardada) — revocar y recrear |
| Aviso «Backend desactualizado» en Usuarios | Ejecutar `supabase functions deploy invite-user` |

**Usuarios creados con el flujo antiguo:** revócalos y créalos de nuevo tras el despliegue.
