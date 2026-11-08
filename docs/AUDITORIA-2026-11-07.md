# Auditoría de CryoVault (7 de noviembre de 2026)

Revisión completa del repositorio `ToneStrife/Cryovault` (app React + Vite + Supabase desplegada en GitHub Pages). Este documento resume lo encontrado, lo que ya está corregido en este mismo cambio y lo que queda pendiente, por orden de importancia.

## 1. Acciones que tienes que hacer tú (no se pueden hacer desde el código)

1. ~~**Revocar el token de GitHub filtrado.**~~ **Hecho el 8 de noviembre de 2026** (revocado en Authorized OAuth Apps). El mensaje del commit `1e32693` (merge de agosto) contiene una URL con un token `gho_…` en claro. El historial es público, así que hay que revocarlo en GitHub → Settings → Developer settings → Personal access tokens (o Applications → Authorized OAuth Apps, si lo generó una herramienta como Dyad). Reescribir el historial no merece la pena: el token ya ha estado expuesto.
2. ~~**Aplicar la migración 019**~~ **Hecho el 7 de noviembre de 2026** (019, 020 y 021 aplicadas con `npx supabase db push`). (`supabase/migrations/20261107120000_019_security_hardening.sql`) con `npx supabase db push` o pegándola en el SQL Editor. Hasta que se aplique, el trigger de alta de usuarios acepta el rol y el laboratorio que envíe el propio cliente.
3. **Desactivar el registro público** en Supabase: Authentication → Providers → Email → *Allow new users to sign up*. La app nunca lo usa (las cuentas las crea la Edge Function con la clave de servicio).
4. **Revisar 21 celdas con dos muestras del mismo código** (congeladores Biobanco y Marga, casi todas en A1, creadas el mismo día). Pueden ser alícuotas legítimas o importaciones repetidas: solo vosotros podéis decidirlo, así que no se ha tocado ningún dato ni se impone unicidad por celda en la base de datos. Consulta para listarlas: `SELECT b.name, s.position_label, s.sample_code, count(*) FROM samples s JOIN boxes b ON b.id = s.box_id WHERE s.deleted_at IS NULL GROUP BY 1,2,3, s.box_id, s.position_row, s.position_column HAVING count(*) > 1;`
5. Opcional: definir `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como variables del repositorio en GitHub Actions si algún día cambias de proyecto Supabase. Mientras tanto el código usa los valores actuales por defecto.

## 2. Seguridad

### Corregido en la migración 019

| Gravedad | Problema | Corrección |
|---|---|---|
| Crítica | `handle_new_user` daba prioridad a `raw_user_meta_data.role/laboratory`, que cualquiera puede enviar en `/auth/v1/signup` con la clave anon. Con el registro público activo, cualquiera podía crearse un perfil `super_admin`. | El rol y el laboratorio salen solo de la invitación pendiente; los metadatos solo aportan el nombre. |
| Alta | `invites.temporary_password` (contraseña provisional en claro) era legible por PostgREST para los admins del laboratorio, que podían iniciar sesión como el invitado. | Permisos por columna: el cliente ya no puede leer ni escribir esa columna. La Edge Function (clave de servicio) sigue funcionando. |
| Alta | Un `admin` leía los `audit_logs` de **todos** los laboratorios (incluidos datos de muestras y perfiles). | Nueva política limitada al laboratorio del usuario, con una función auxiliar `profile_laboratory()`. |
| Alta | La política «Users can insert own profile» permitía a cualquier usuario autenticado sin perfil insertarse con el rol que quisiera. | Política eliminada (el trigger ya crea el perfil). |
| Alta | Las claves foráneas a `auth.users` no tenían `ON DELETE`, así que `auth.admin.deleteUser` (revocar usuario) fallaba para cualquier usuario con actividad. | Pasan a `ON DELETE SET NULL`. |
| Media | Una muestra podía apuntar a una caja de otro laboratorio y un rack a otro congelador. | Políticas restrictivas nuevas (`box_in_my_lab`, rack del mismo congelador). |
| Media | No había política UPDATE en Storage, así que volver a subir una imagen (`upsert`) fallaba. | Política añadida. |
| Baja | `recalculate_box_occupancy` era ejecutable por `anon` vía RPC. | Permiso revocado (solo la llaman triggers). |

### Corregido en el código

- Clave y URL de Supabase ahora se leen de `VITE_SUPABASE_*` (con los valores actuales como respaldo). `.env.local` deja de estar en git y hay un `.env.example`.
- Consultas con texto del usuario interpolado en filtros de PostgREST (escáner QR y búsqueda rápida del panel): ahora se valida el UUID o se sanean los caracteres `, ( ) % \`.
- Las trazas de autenticación con ids de usuario solo se escriben en consola en desarrollo.
- Dependencias: `xlsx` pasa a la versión 0.20.3 de SheetJS (corrige dos avisos altos); `to-ico` (que arrastraba `request`, `jimp`, etc. con avisos críticos) se sustituye por `png-to-ico`; se eliminan ocho dependencias sin uso (`zod`, `zustand`, `date-fns`, `papaparse`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@hookform/resolvers`, devtools); `npm audit fix` aplicado. Quedan avisos solo en herramientas de desarrollo (`vite` 5 / `esbuild`, `vite-plugin-pwa`, `sharp`), que requieren saltos de versión mayor.

### Pendiente (decisión de diseño)

- **Contraseñas provisionales en claro.** Aunque ya no se ven desde el cliente, siguen guardadas en texto plano en `invites.temporary_password` y la Edge Function las devuelve con «Ver credenciales». Lo más seguro es mostrarlas una sola vez al crear al usuario y no guardarlas.
- `user_permissions` (revocar permisos a un usuario concreto) solo se aplica en la interfaz; las políticas de la base de datos miran únicamente `profiles.role`.
- Los checks de rol de la interfaz (`canManageBoxes`, etc.) coinciden con las políticas, pero el super admin no puede cambiar el rol de un admin (la política exige `role = 'admin'` también en el valor nuevo).
- El bucket `cryo-images` es público y cualquier usuario autenticado puede subir a cualquier ruta.
- La Edge Function construye la URL del email con la cabecera `Origin` si no hay `PUBLIC_SITE_URL`: conviene fijar siempre ese secreto.

## 3. Bugs corregidos en el frontend

| Problema | Archivo |
|---|---|
| Borrar un congelador eliminaba en cascada sus cajas (sin papelera) y dejaba muestras sin posición. Ahora se exige vaciarlo antes y el error se muestra. | `src/pages/FreezersPage.tsx` |
| Exportación, importación e informes se cortaban en 1000 filas (límite de PostgREST). Ahora se paginan todas las muestras con `fetchAllSamples`. | `src/lib/labExport.ts`, `labImport.ts`, `ReportsPage.tsx`, `DashboardPage.tsx` |
| Contadores del panel y de congeladores incluían cajas y muestras eliminadas. | `DashboardPage.tsx`, `FreezersPage.tsx` |
| Imprimir una caja salía en blanco (el área de impresión estaba dentro de un ancestro oculto). Ahora se usan reglas `@media print` con `visibility`. | `BoxDetailPage.tsx`, `src/index.css` |
| La pantalla de carga se quedaba colgada si fallaba `getUser()`. | `src/components/ProtectedRoute.tsx` |
| La importación de una caja se quedaba en «Importando…» si el archivo no se podía leer. | `BoxDetailPage.tsx` |
| El super admin veía la lista de usuarios vacía. | `UsersPage.tsx` |
| «Ver todos los resultados» del panel enviaba `?q=` y la búsqueda solo leía `?code=`. | `SearchPage.tsx` |
| El pie de la imagen exportada de la cuadrícula se dibujaba fuera del lienzo (`canvasW` en vez de `canvasH`). | `BoxDetailPage.tsx` |
| Escáner QR: consulta mal formada con QR no UUID, errores ignorados y «Intentar de nuevo» que llamaba a `start()` sin parámetros. | `src/components/QrScannerDialog.tsx` |

## 4. Limpieza del repositorio

- Fuera de git: `node_modules` (48 archivos subidos), `.vite/`, `assets/index-*.js` (un build antiguo en la raíz), `*.tsbuildinfo`, `.bolt/`, `.env.local`, `pnpm-lock.yaml` (había dos lockfiles; CI usa npm).
- `package.json`: nombre `cryovault` 1.0.0 (era `vite-react-typescript-starter` 0.0.0).
- Código muerto eliminado: `RegisterPage.tsx` y `SamplesPage.tsx` (681 líneas sin ruta).
- Workflow de despliegue: `npm ci` con caché, `typecheck` antes del build, `concurrency`, acción de Pages v4 y variables de entorno.
- `AI_RULES.md` actualizado para reflejar las librerías que realmente se usan.

## 5. Rendimiento

- **Carga perezosa por ruta** (`React.lazy` + `Suspense`) y chunks separados para React, Supabase y TanStack Query. Antes: un único archivo de 1,7 MB (495 KB gzip). Ahora el login carga unos 330 KB sin comprimir (110 KB gzip) y cada página trae lo suyo; `xlsx` y `recharts` solo se descargan al abrir detalle de caja, informes o panel.
- Pendiente: la búsqueda descarga todas las muestras del laboratorio y filtra en memoria; los informes cargan muestras, cajas, congeladores, auditoría y perfiles completos; la importación inserta fila a fila. Con cientos de muestras va bien; con decenas de miles convendrá filtrar en servidor y usar inserciones por lotes o RPC.

## 6. Calidad y mantenimiento (pendiente, por prioridad)

1. **Regenerar `src/lib/database.types.ts`** (`npx supabase gen types typescript --linked > src/lib/database.types.ts`). Está desactualizado desde la migración 003, y es la causa de los ~165 `as any` que ESLint marca ahora como aviso. También faltan `deleted_at`/`deleted_by` en `types/index.ts`.
2. **Mutaciones sin `onError`** en varios diálogos (editar muestra, quitar de caja, renombrar caja, eliminar/restaurar en búsqueda): el fallo no se muestra al usuario.
3. **Operaciones multi-paso sin transacción** (sacar caja, mover varias muestras, guardar permisos): un fallo a mitad deja estado mixto. La solución limpia es una función RPC por operación.
4. **Reducir filas o columnas de una caja** deja muestras fuera de la cuadrícula sin aviso.
5. **`BoxDetailPage.tsx` (2.200 líneas, ~40 estados)**, `FreezerDetailPage.tsx` (1.400) y `UsersPage.tsx` (1.100) mezclan demasiadas responsabilidades; el selector de celda libre está copiado en cuatro diálogos y los mapas de etiquetas de estado/tipo en cinco páginas.
6. Textos: mezcla de «Balda» y «Zona», menú con «Freezers»/«Dashboard» junto a «Cajas»/«Ajustes»; etiquetas de estado sin `in_use`; `alert()`/`confirm()` nativos en vez de diálogos.
7. Accesibilidad: botones de icono sin nombre accesible, `<label>` sin `htmlFor`.
8. Actualizaciones mayores pendientes: Vite 5 → 8, `vite-plugin-pwa` 1.x, `sharp`, `@vitejs/plugin-react`, React 19.
9. La rama `cursor/cloud-agent-1788533160269-8i2zi` es un experimento antiguo que diverge de `main` (26 archivos); si no se va a usar, borrarla.
10. El repositorio `Cryovault2` es una copia anterior con otra rama por defecto (`main2`); si está abandonado, archivarlo para evitar confusiones.

## 7. Cómo se ha verificado

- `npm run typecheck`: sin errores.
- `npm run lint`: 0 errores, 164 avisos (todos `no-explicit-any`).
- `npm run build`: correcto; vista previa local del build (`vite preview`) carga el login con los chunks perezosos.
- La migración 019 está escrita contra el esquema de las migraciones 001-018 y es idempotente, pero **no se ha ejecutado contra el proyecto real**: hazlo primero en una rama o proyecto de pruebas si puedes.
