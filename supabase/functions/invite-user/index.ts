// @ts-expect-error Deno resolves remote npm imports at runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type InvitePayload = {
  email?: string;
  role?: string;
  laboratory?: string;
  full_name?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Missing Supabase function environment variables' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return json({ error: 'Missing authorization token' }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Invalid session' }, 401);

  const { data: inviter, error: profileError } = await adminClient
    .from('profiles')
    .select('id, role, laboratory')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !inviter) return json({ error: 'Inviter profile not found' }, 403);

  const payload = (await req.json()) as InvitePayload;
  const email = payload.email?.trim().toLowerCase();
  const requestedRole = payload.role || 'researcher';
  const requestedLab = payload.laboratory?.trim();

  if (!email || !email.includes('@')) return json({ error: 'Email inválido' }, 400);

  let role = requestedRole;
  let laboratory = requestedLab;

  if (inviter.role === 'super_admin') {
    role = 'admin';
    if (!laboratory) return json({ error: 'Selecciona un laboratorio' }, 400);
  } else if (inviter.role === 'admin') {
    if (requestedRole === 'super_admin') return json({ error: 'No puedes invitar admin general' }, 403);
    role = requestedRole;
    laboratory = inviter.laboratory;
  } else {
    return json({ error: 'No tienes permiso para invitar usuarios' }, 403);
  }

  const { data: lab, error: labError } = await adminClient
    .from('laboratories')
    .select('slug')
    .eq('slug', laboratory)
    .maybeSingle();

  if (labError || !lab) return json({ error: 'Laboratorio no encontrado' }, 400);

  const redirectTo = `${req.headers.get('origin') || ''}/login`;
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      full_name: payload.full_name || email,
      role,
      laboratory,
    },
  });

  if (inviteError) return json({ error: inviteError.message }, 400);

  const { data: existingInvite } = await adminClient
    .from('invites')
    .select('id')
    .eq('email', email)
    .eq('laboratory', laboratory)
    .is('accepted_at', null)
    .maybeSingle();

  if (existingInvite?.id) {
    const { error } = await adminClient
      .from('invites')
      .update({ role, invited_by: authData.user.id })
      .eq('id', existingInvite.id);
    if (error) return json({ error: error.message }, 400);
  } else {
    const { error } = await adminClient
      .from('invites')
      .insert([{ email, role, laboratory, invited_by: authData.user.id }]);
    if (error) return json({ error: error.message }, 400);
  }

  return json({ ok: true });
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
