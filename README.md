# CryoVault

Gestión de muestras biológicas en congeladores. App web desplegada en [GitHub Pages](https://tonestrife.github.io/Cryovault/).

## Instalar como app (PWA)

En **Chrome/Edge** (móvil o escritorio): usa el banner «Instalar CryoVault» o el icono de instalación en la barra de direcciones.

En **iOS Safari**: Compartir → **Añadir a pantalla de inicio**.

Requiere HTTPS (GitHub Pages lo cumple).

## Branding e iconos

Regenerar favicon, iconos PWA y imagen social:

```bash
npm run icons:generate
```

Fuentes en `public/brand/icon.svg` y `public/brand/og-template.svg`.

### Vista previa del repositorio en GitHub

1. Ejecuta `npm run icons:generate` (genera `docs/github-social-preview.png`).
2. En el repo: **Settings → General → Social preview** → sube `docs/github-social-preview.png`.

Al compartir el enlace del sitio, Open Graph usa `og-image.png` del despliegue.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # URL y clave anon de tu proyecto Supabase
npm run dev
npm run typecheck
npm run lint
npm run build
```

El despliegue a GitHub Pages lo hace el workflow `.github/workflows/deploy.yml` en cada push a `main`. Si quieres que el build use otro proyecto Supabase, define las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en **Settings → Secrets and variables → Actions → Variables** del repositorio.

## Base de datos (Supabase)

Las migraciones viven en `supabase/migrations/` y **no se aplican solas** al hacer push. Tras cambiar el esquema:

```bash
npx supabase db push
```

La migración `019_security_hardening` (auditoría 2026-11-07) es obligatoria: cierra una vía de escalado de privilegios en el alta de usuarios. Además hay que desactivar el registro público en **Authentication → Providers → Email → Allow new users to sign up** (los usuarios solo se crean desde Usuarios, vía Edge Function). Detalle en [docs/AUDITORIA-2026-11-07.md](docs/AUDITORIA-2026-11-07.md).

## Backup

Ver [docs/BACKUP.md](docs/BACKUP.md) para backups de Supabase (recuperación ante desastres).
