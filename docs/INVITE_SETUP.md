# Invitación de usuarios — configuración

CryoVault solo permite altas por invitación. El flujo es: **email con enlace mágico** → Supabase valida el token → redirige a `/accept-invite` → **crea contraseña** → accede al laboratorio.

## Supabase Dashboard

### Authentication → URL Configuration

| Campo | Valor (producción) |
|-------|-------------------|
| **Site URL** | `https://tonestrife.github.io/Cryovault/` |
| **Redirect URLs** | `https://tonestrife.github.io/Cryovault/accept-invite` |
| | `https://tonestrife.github.io/Cryovault/accept-invite/` |
| | `http://localhost:5173/Cryovault/accept-invite` |
| | `http://localhost:5174/Cryovault/accept-invite` |

El enlace del correo pasa primero por `https://<proyecto>.supabase.co/auth/v1/verify?token=...&type=invite&redirect_to=.../accept-invite`. Eso es correcto; la app debe leer lo que Supabase añade al llegar a `accept-invite`.

### Email

- Activa el proveedor **Email** en Authentication → Providers.
- Configura **SMTP** (recomendado en producción) o usa el correo por defecto de Supabase (límites bajos).

### Edge Function `invite-user`

Secrets en **Project Settings → Edge Functions**:

| Secret | Ejemplo |
|--------|---------|
| `SUPABASE_URL` | (automático al desplegar) |
| `SUPABASE_ANON_KEY` | (automático) |
| `SUPABASE_SERVICE_ROLE_KEY` | (automático) |
| `PUBLIC_SITE_URL` | `https://tonestrife.github.io` |

Despliegue:

```bash
supabase functions deploy invite-user
```

## Flujo en la app

1. Admin → **Usuarios** → **Invitar** → introduce email.
2. El invitado recibe correo de Supabase.
3. Al hacer clic, la app establece sesión con `verifyOtp` (`token_hash`), tokens en `#access_token`, o PKCE si aplica.
4. Pantalla **Activar tu cuenta** → contraseña obligatoria.
5. Si el enlace caduca: admin → **Reenviar enlace** (magic link OTP).

## Si siempre sale «Enlace inválido o caducado»

La pantalla muestra el **mensaje real** de Supabase cuando está disponible. Causas habituales:

| Causa | Qué hacer |
|-------|-----------|
| Redirect URL no permitida | Añadir exactamente `https://tonestrife.github.io/Cryovault/accept-invite` en Supabase Auth |
| Abrir el email en otro navegador con solo `?code=` (PKCE) | La app ahora usa también `#access_token` y `token_hash`; redesplegar la app |
| Enlace caducado (24 h por defecto) | **Reenviar enlace** desde Usuarios |
| App desactualizada en GitHub Pages | Esperar el deploy tras push a `main` |

**Tras hacer clic en el email**, mira la barra de direcciones en `tonestrife.github.io` (sin copiar tokens completos):

- `#access_token=...` → flujo implícito (soportado)
- `?token_hash=...&type=invite` → `verifyOtp` (soportado)
- `?code=...` sin haber abierto antes la app en ese navegador → PKCE falla; debería redirigir con hash si la configuración de Supabase lo permite

En desarrollo, la consola muestra `[CryoVault auth] URL shape: ...` con el tipo de parámetros detectados.

## Checklist de prueba

- [ ] Invitar email nuevo desde Usuarios (admin).
- [ ] Abrir el enlace en el **móvil** (navegador del correo, no el PC del admin).
- [ ] Ver pantalla «Activar tu cuenta», no «Enlace inválido».
- [ ] Crear contraseña y llegar al dashboard.
- [ ] Cerrar sesión e iniciar sesión con email + contraseña.
- [ ] En Usuarios, la invitación aparece como aceptada (`accepted_at`).
- [ ] Reenviar enlace a otra invitación pendiente.

## Errores frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| PKCE code verifier not found | Enlace abierto en dispositivo distinto; reenviar invitación o usar redirect con hash |
| Perfil no asignado | Sin fila en `invites` o laboratorio incorrecto en metadata |
| Email no llega | SMTP no configurado o carpeta spam |
| Reenviar falla | No hay invitación pendiente para ese email |
