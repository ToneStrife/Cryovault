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
npm run dev
npm run build
```

## Backup

Ver [docs/BACKUP.md](docs/BACKUP.md) para backups de Supabase (recuperación ante desastres).
