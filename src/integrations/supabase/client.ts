import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

// La URL y la clave anon/publishable son públicas por diseño (viajan en el bundle),
// pero se leen de variables de entorno para poder cambiar de proyecto sin tocar código.
// Los valores por defecto mantienen el despliegue actual funcionando si no se definen.
const DEFAULT_SUPABASE_URL = 'https://yyfthcebyqylhjkrzsph.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5ZnRoY2VieXF5bGhqa3J6c3BoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjA3NzcsImV4cCI6MjA5NDQzNjc3N30.9n7aM1ZyUkuZBlIu_SZXgqJ-Oaocd6IcioRq3vXYC5Y';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
