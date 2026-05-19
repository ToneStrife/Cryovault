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
  action?: 'invite' | 'resend';
  email?: string;
  role?: string;
  laboratory?: string;
  full_name?: string;
  invite_id?: string;
};

function getRedirectTo(req: Request): string {
  const siteUrl =
    Deno.env.get('PUBLIC_SITE_URL')?.replace(/\/$/, '') ||
    req.headers.get('origin')?.replace(/\/$/, '') ||
    'https://tonestrife.github.io';
  return `${siteUrl}/Cryovault/accept-invite`;
}

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
  const action = payload.action || 'invite';
  const redirectTo = getRedirectTo(req);

  if (action === 'resend') {
    return handleResend(adminClient, inviter, payload, redirectTo);
  }

  return handleInvite(adminClient, inviter, authData.user.id, payload, redirectTo);
});

async function handleResend(
  adminClient: ReturnType<typeof createClient>,
  inviter: { role: string; laboratory: string },
  payload: InvitePayload,
  redirectTo: string,
) {
  if (inviter.role !== 'super_admin' && inviter.role !== 'admin') {
    return json({ error: 'No tienes permiso para reenviar invitaciones' }, 403);
  }

  const email = payload.email?.trim().toLowerCase();
  if (!email) return json({ error: 'Email inválido' }, 400);

  let query = adminClient
    .from('invites')
    .select('id, email, role, laboratory')
    .eq('email', email)
    .is('accepted_at', null);

  if (inviter.role === 'admin') {
    query = query.eq('laboratory', inviter.laboratory);
  }

  const { data: invite, error: inviteErr } = await query.maybeSingle();
  if (inviteErr) return json({ error: inviteErr.message }, 400);
  if (!invite) return json({ error: 'No hay invitación pendiente para este email' }, 404);

  const { error: otpError } = await adminClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
      data: {
        role: invite.role,
        laboratory: invite.laboratory,
        needs_password_setup: true,
      },
    },
  });

  if (otpError) return json({ error: otpError.message }, 400);

  return json({ ok: true, action: 'resend' });
}

async function handleInvite(
  adminClient: ReturnType<typeof createClient>,
  inviter: { role: string; laboratory: string },
  inviterId: string,
  payload: InvitePayload,
  redirectTo: string,
) {
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

  const userMeta = {
    full_name: payload.full_name || email,
    role,
    laboratory,
    needs_password_setup: true,
  };

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: userMeta,
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
      .update({ role, invited_by: inviterId })
      .eq('id', existingInvite.id);
    if (error) return json({ error: error.message }, 400);
  } else {
    const { error } = await adminClient
      .from('invites')
      .insert([{ email, role, laboratory, invited_by: inviterId }]);
    if (error) return json({ error: error.message }, 400);
  }

  return json({ ok: true, action: 'invite' });
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
