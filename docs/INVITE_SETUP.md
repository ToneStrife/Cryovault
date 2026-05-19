# Invitación de usuarios — configuración

CryoVault solo permite altas por invitación. El flujo es: **email con enlace mágico** → el usuario abre `/accept-invite` → **crea contraseña** → accede al laboratorio.

## Supabase Dashboard

### Authentication → URL Configuration

| Campo | Valor (producción) |
|-------|-------------------|
| **Site URL** | `https://tonestrife.github.io/Cryovault/` |
| **Redirect URLs** | `https://tonestrife.github.io/Cryovault/accept-invite` |
| | `http://localhost:5173/Cryovault/accept-invite` |
| | `http://localhost:5174/Cryovault/accept-invite` |

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
3. Al hacer clic, la app intercambia el código PKCE (`exchangeCodeForSession`) y muestra el formulario de contraseña.
4. Tras guardar la contraseña, entra al dashboard.
5. Si el enlace caduca: admin puede pulsar **Reenviar enlace** (magic link OTP).

## Checklist de prueba

- [ ] Invitar email nuevo desde Usuarios (admin).
- [ ] Abrir el enlace en el móvil (Chrome/Safari).
- [ ] Ver pantalla «Activar tu cuenta», no «Enlace inválido».
- [ ] Crear contraseña y llegar al dashboard.
- [ ] Cerrar sesión e iniciar sesión con email + contraseña.
- [ ] En Usuarios, la invitación aparece como aceptada (`accepted_at`).
- [ ] Reenviar enlace a otra invitación pendiente y comprobar el segundo correo.

## Errores frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| Enlace inválido al instante | Redirect URL no permitida en Supabase o falta `?code=` sin `exchangeCodeForSession` |
| Perfil no asignado | Sin fila en `invites` o laboratorio incorrecto en metadata |
| Email no llega | SMTP no configurado o carpeta spam |
| Reenviar falla | Usuario aún no existe en Auth; re-invitar en lugar de reenviar |
