# Backup y restauración — Cryovault

Cryovault usa dos capas complementarias:

| Capa | Para qué sirve | Dónde |
|------|----------------|--------|
| **Supabase** | Recuperación ante desastres, copia completa de PostgreSQL, auth y storage | Este documento |
| **App (Ajustes → Datos)** | Exportar/importar datos operativos del laboratorio (Excel) | Pantalla Configuración |

---

## 1. Backups automáticos (Supabase Dashboard)

1. Entra en [Supabase Dashboard](https://supabase.com/dashboard) → tu proyecto Cryovault.
2. **Project Settings** → **Database** → **Backups**.
3. Revisa la frecuencia según tu plan (Free vs Pro).

Los backups diarios de Supabase cubren la base PostgreSQL completa (esquema + datos), incluidas tablas con RLS.

---

## 2. Point-in-Time Recovery (PITR)

Disponible en planes de pago. Permite restaurar a un instante concreto antes de un borrado o migración fallida.

- Actívalo en **Database** → **Backups** → **Point in Time Recovery**.
- Recomendado si el laboratorio depende de Cryovault en producción.

---

## 3. Export manual con `pg_dump` (antes de cambios grandes)

Con la cadena de conexión directa (Settings → Database → Connection string → URI):

```bash
pg_dump "postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres" \
  --format=custom \
  --file=cryovault-backup-$(date +%Y%m%d).dump
```

Guarda el archivo en un sitio seguro (no en el repositorio git).

---

## 4. Restaurar un backup

**Nunca restaures directamente sobre producción** sin ventana de mantenimiento y copia previa.

1. Crea un **proyecto Supabase de staging** o restaura el backup en un entorno nuevo.
2. Aplica las mismas migraciones del repo (`supabase/migrations/`) si el esquema no viene en el dump.
3. Actualiza variables de entorno de la app (`VITE_SUPABASE_URL`, clave anon) solo cuando verifiques el entorno.
4. Comprueba login, RLS y una muestra de datos.

Para restaurar desde el dashboard: **Database** → **Backups** → elegir backup → **Restore** (según opciones del plan).

---

## 5. Storage (`cryo-images`)

Las imágenes de congeladores/cajas viven en **Storage**, no solo en PostgreSQL.

- Dashboard → **Storage** → bucket `cryo-images` → descarga o sincroniza periódicamente.
- Un backup de BD **no** incluye archivos del bucket.

---

## 6. Esquema vs datos

| Qué | Fuente de verdad |
|-----|------------------|
| Estructura de tablas, RLS, funciones | `supabase/migrations/*.sql` en git |
| Filas (muestras, cajas, usuarios…) | Backups Supabase + export Excel desde la app |

Tras clonar un proyecto nuevo: `supabase db push` o aplicar migraciones, luego restaurar datos o importar Excel.

---

## 7. Export/import desde la app (operativo)

En **Configuración** (solo administradores):

- **Exportar laboratorio**: Excel multi-hoja (congeladores, racks, cajas, muestras) filtrado por tu laboratorio.
- **Importar muestras**: carga masiva en cajas **ya existentes**; no recrea congeladores ni cajas.

En **Detalle de caja**:

- Exportar / importar muestras de una sola caja (plantilla Excel).

---

## 8. Cuándo usar qué

| Situación | Acción |
|-----------|--------|
| Borrado masivo accidental | PITR o restore de backup Supabase |
| Migrar a otro proyecto Supabase | Backup + restore en proyecto nuevo |
| Informe, auditoría, mudanza de datos | Export Excel desde la app |
| Cargar muchas muestras nuevas | Import Excel (caja o laboratorio) |
| Desarrollo local | Migraciones + seed; no uses backup de prod en local sin anonimizar |
