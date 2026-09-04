// @ts-expect-error Deno resolves remote npm imports at runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getLoginUrl, getSmtpConfig, sendCredentialsEmail } from './smtp.ts';

declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const API_VERSION = 'provisioned-v2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

type InvitePayload = {
  action?: 'create' | 'reset_credentials' | 'resend_email' | 'get_credentials' | 'revoke' | 'admin_reset_password';
  email?: string;
  role?: string;
  laboratory?: string;
  full_name?: string;
  password?: string;
  send_email?: boolean;
  invite_id?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed', version: API_VERSION }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Missing Supabase function environment variables', version: API_VERSION }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return json({ error: 'Missing authorization token', version: API_VERSION }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Invalid session', version: API_VERSION }, 401);

  const { data: inviter, error: profileError } = await adminClient
    .from('profiles')
    .select('id, role, laboratory')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !inviter) return json({ error: 'Inviter profile not found', version: API_VERSION }, 403);

  const payload = (await req.json()) as InvitePayload;
  const action = payload.action || 'create';

  if (action === 'reset_credentials') {
    return handleResetCredentials(adminClient, inviter, payload, req);
  }

  if (action === 'resend_email') {
    return handleResendEmail(adminClient, inviter, payload, req);
  }

  if (action === 'get_credentials') {
    return handleGetCredentials(adminClient, inviter, payload, req);
  }

  if (action === 'revoke') {
    return handleRevoke(adminClient, inviter, payload);
  }

  if (action === 'admin_reset_password') {
    return handleAdminResetPassword(adminClient, inviter, payload, req);
  }

  return handleCreate(adminClient, inviter, authData.user.id, payload, req);
});

function generateTemporaryPassword(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join('');
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  return null;
}

async function resolveRoleAndLab(
  inviter: { role: string; laboratory: string },
  payload: InvitePayload,
): Promise<{ role: string; laboratory: string } | Response> {
  const requestedRole = payload.role || 'researcher';
  const requestedLab = payload.laboratory?.trim();

  if (inviter.role === 'super_admin') {
    if (!requestedLab) return json({ error: 'Selecciona un laboratorio', version: API_VERSION }, 400);
    return { role: 'admin', laboratory: requestedLab };
  }

  if (inviter.role === 'admin') {
    if (requestedRole === 'super_admin') return json({ error: 'No puedes invitar admin general', version: API_VERSION }, 403);
    return { role: requestedRole, laboratory: inviter.laboratory };
  }

  return json({ error: 'No tienes permiso para gestionar usuarios', version: API_VERSION }, 403);
}

function assertCanManageInvites(inviter: { role: string; laboratory: string }): Response | null {
  if (inviter.role !== 'super_admin' && inviter.role !== 'admin') {
    return json({ error: 'No tienes permiso para gestionar usuarios', version: API_VERSION }, 403);
  }
  return null;
}

async function findPendingInvite(
  adminClient: ReturnType<typeof createClient>,
  inviter: { role: string; laboratory: string },
  email: string,
) {
  let query = adminClient
    .from('invites')
    .select('id, email, role, laboratory, temporary_password')
    .eq('email', email)
    .is('accepted_at', null);

  if (inviter.role === 'admin') {
    query = query.eq('laboratory', inviter.laboratory);
  }

  return query.maybeSingle();
}

async function saveTemporaryPassword(
  adminClient: ReturnType<typeof createClient>,
  inviteId: string,
  temporaryPassword: string,
) {
  const { error } = await adminClient
    .from('invites')
    .update({ temporary_password: temporaryPassword })
    .eq('id', inviteId);
  if (error) throw new Error(error.message);
}

async function trySendEmail(
  req: Request,
  email: string,
  temporaryPassword: string,
  sendEmail: boolean,
): Promise<{ email_sent: boolean; email_error?: string }> {
  if (!sendEmail) return { email_sent: false };

  const smtp = getSmtpConfig();
  if (!smtp) {
    return { email_sent: false, email_error: 'SMTP no configurado en la Edge Function' };
  }

  try {
    const loginUrl = getLoginUrl(req);
    await sendCredentialsEmail(smtp, email, loginUrl, email, temporaryPassword);
    return { email_sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al enviar email';
    return { email_sent: false, email_error: message };
  }
}

async function handleCreate(
  adminClient: ReturnType<typeof createClient>,
  inviter: { role: string; laboratory: string },
  inviterId: string,
  payload: InvitePayload,
  req: Request,
) {
  const email = payload.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) return json({ error: 'Email inválido', version: API_VERSION }, 400);

  const roleLab = await resolveRoleAndLab(inviter, payload);
  if (roleLab instanceof Response) return roleLab;
  const { role, laboratory } = roleLab;

  const { data: lab, error: labError } = await adminClient
    .from('laboratories')
    .select('slug')
    .eq('slug', laboratory)
    .maybeSingle();

  if (labError || !lab) return json({ error: 'Laboratorio no encontrado', version: API_VERSION }, 400);

  const { data: existingProfile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingProfile) return json({ error: 'Ya existe un usuario con este email', version: API_VERSION }, 400);

  let temporaryPassword = payload.password?.trim() || '';
  if (!temporaryPassword) {
    temporaryPassword = generateTemporaryPassword();
  } else {
    const passwordError = validatePassword(temporaryPassword);
    if (passwordError) return json({ error: passwordError, version: API_VERSION }, 400);
  }

  const userMeta = {
    full_name: payload.full_name || email,
    role,
    laboratory,
    needs_password_setup: true,
  };

  const { data: existingInvite } = await adminClient
    .from('invites')
    .select('id')
    .eq('email', email)
    .eq('laboratory', laboratory)
    .is('accepted_at', null)
    .maybeSingle();

  let inviteId = existingInvite?.id;

  if (inviteId) {
    const { error } = await adminClient
      .from('invites')
      .update({ role, invited_by: inviterId, temporary_password: temporaryPassword })
      .eq('id', inviteId);
    if (error) return json({ error: error.message, version: API_VERSION }, 400);
  } else {
    const { data: inserted, error } = await adminClient
      .from('invites')
      .insert([{ email, role, laboratory, invited_by: inviterId, temporary_password: temporaryPassword }])
      .select('id')
      .single();
    if (error) return json({ error: error.message, version: API_VERSION }, 400);
    inviteId = inserted.id;
  }

  const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: userMeta,
  });

  if (createError) {
    await adminClient.from('invites').delete().eq('email', email).is('accepted_at', null);
    return json({ error: createError.message, version: API_VERSION }, 400);
  }

  const emailResult = await trySendEmail(req, email, temporaryPassword, payload.send_email === true);

  return json({
    ok: true,
    action: 'create',
    version: API_VERSION,
    email,
    temporary_password: temporaryPassword,
    login_url: getLoginUrl(req),
    user_id: createdUser.user?.id,
    invite_id: inviteId,
    ...emailResult,
  });
}

async function handleGetCredentials(
  adminClient: ReturnType<typeof createClient>,
  inviter: { role: string; laboratory: string },
  payload: InvitePayload,
  req: Request,
) {
  const denied = assertCanManageInvites(inviter);
  if (denied) return denied;

  const email = payload.email?.trim().toLowerCase();
  if (!email) return json({ error: 'Email inválido', version: API_VERSION }, 400);

  const { data: invite, error: inviteErr } = await findPendingInvite(adminClient, inviter, email);
  if (inviteErr) return json({ error: inviteErr.message, version: API_VERSION }, 400);
  if (!invite) return json({ error: 'No hay usuario pendiente de activación para este email', version: API_VERSION }, 404);
  if (!invite.temporary_password) {
    return json({ error: 'No hay contraseña provisional guardada. Usa «Nueva contraseña».', version: API_VERSION }, 404);
  }

  return json({
    ok: true,
    action: 'get_credentials',
    version: API_VERSION,
    email: invite.email,
    temporary_password: invite.temporary_password,
    login_url: getLoginUrl(req),
    email_sent: false,
  });
}

async function handleResendEmail(
  adminClient: ReturnType<typeof createClient>,
  inviter: { role: string; laboratory: string },
  payload: InvitePayload,
  req: Request,
) {
  const denied = assertCanManageInvites(inviter);
  if (denied) return denied;

  const email = payload.email?.trim().toLowerCase();
  if (!email) return json({ error: 'Email inválido', version: API_VERSION }, 400);

  const { data: invite, error: inviteErr } = await findPendingInvite(adminClient, inviter, email);
  if (inviteErr) return json({ error: inviteErr.message, version: API_VERSION }, 400);
  if (!invite) return json({ error: 'No hay usuario pendiente de activación para este email', version: API_VERSION }, 404);
  if (!invite.temporary_password) {
    return json({ error: 'No hay contraseña provisional guardada. Usa «Nueva contraseña».', version: API_VERSION }, 404);
  }

  const emailResult = await trySendEmail(req, email, invite.temporary_password, true);

  return json({
    ok: true,
    action: 'resend_email',
    version: API_VERSION,
    email: invite.email,
    temporary_password: invite.temporary_password,
    login_url: getLoginUrl(req),
    ...emailResult,
  });
}

async function handleResetCredentials(
  adminClient: ReturnType<typeof createClient>,
  inviter: { role: string; laboratory: string },
  payload: InvitePayload,
  req: Request,
) {
  const denied = assertCanManageInvites(inviter);
  if (denied) return denied;

  const email = payload.email?.trim().toLowerCase();
  if (!email) return json({ error: 'Email inválido', version: API_VERSION }, 400);

  const { data: invite, error: inviteErr } = await findPendingInvite(adminClient, inviter, email);
  if (inviteErr) return json({ error: inviteErr.message, version: API_VERSION }, 400);
  if (!invite) return json({ error: 'No hay usuario pendiente de activación para este email', version: API_VERSION }, 404);

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (!profile) return json({ error: 'Usuario no encontrado', version: API_VERSION }, 404);

  let temporaryPassword = payload.password?.trim() || '';
  if (!temporaryPassword) {
    temporaryPassword = generateTemporaryPassword();
  } else {
    const passwordError = validatePassword(temporaryPassword);
    if (passwordError) return json({ error: passwordError, version: API_VERSION }, 400);
  }

  const { data: authUser, error: getUserError } = await adminClient.auth.admin.getUserById(profile.id);
  if (getUserError || !authUser.user) return json({ error: 'Usuario de autenticación no encontrado', version: API_VERSION }, 404);

  const { error: updateError } = await adminClient.auth.admin.updateUserById(profile.id, {
    password: temporaryPassword,
    user_metadata: {
      ...authUser.user.user_metadata,
      needs_password_setup: true,
    },
  });

  if (updateError) return json({ error: updateError.message, version: API_VERSION }, 400);

  try {
    await saveTemporaryPassword(adminClient, invite.id, temporaryPassword);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al guardar contraseña';
    return json({ error: message, version: API_VERSION }, 400);
  }

  const emailResult = await trySendEmail(
    req,
    email,
    temporaryPassword,
    payload.send_email !== false,
  );

  return json({
    ok: true,
    action: 'reset_credentials',
    version: API_VERSION,
    email,
    temporary_password: temporaryPassword,
    login_url: getLoginUrl(req),
    ...emailResult,
  });
}

async function handleAdminResetPassword(
  adminClient: ReturnType<typeof createClient>,
  inviter: { id: string; role: string; laboratory: string },
  payload: InvitePayload,
  req: Request,
) {
  const denied = assertCanManageInvites(inviter);
  if (denied) return denied;

  const email = payload.email?.trim().toLowerCase();
  if (!email) return json({ error: 'Email inválido', version: API_VERSION }, 400);

  let profileQuery = adminClient
    .from('profiles')
    .select('id, email, role, laboratory')
    .eq('email', email);

  if (inviter.role === 'admin') {
    profileQuery = profileQuery.eq('laboratory', inviter.laboratory).neq('role', 'super_admin');
  }

  const { data: profile, error: profileErr } = await profileQuery.maybeSingle();
  if (profileErr) return json({ error: profileErr.message, version: API_VERSION }, 400);
  if (!profile) return json({ error: 'Usuario no encontrado en tu laboratorio', version: API_VERSION }, 404);
  if (profile.id === inviter.id) {
    return json({ error: 'No puedes resetear tu propia contraseña desde aquí', version: API_VERSION }, 400);
  }

  let temporaryPassword = payload.password?.trim() || '';
  if (!temporaryPassword) {
    temporaryPassword = generateTemporaryPassword();
  } else {
    const passwordError = validatePassword(temporaryPassword);
    if (passwordError) return json({ error: passwordError, version: API_VERSION }, 400);
  }

  const { data: authUser, error: getUserError } = await adminClient.auth.admin.getUserById(profile.id);
  if (getUserError || !authUser.user) return json({ error: 'Usuario de autenticación no encontrado', version: API_VERSION }, 404);

  const { error: updateError } = await adminClient.auth.admin.updateUserById(profile.id, {
    password: temporaryPassword,
    user_metadata: {
      ...authUser.user.user_metadata,
      needs_password_setup: true,
    },
  });

  if (updateError) return json({ error: updateError.message, version: API_VERSION }, 400);

  const emailResult = await trySendEmail(
    req,
    email,
    temporaryPassword,
    payload.send_email === true,
  );

  return json({
    ok: true,
    action: 'admin_reset_password',
    version: API_VERSION,
    email,
    temporary_password: temporaryPassword,
    login_url: getLoginUrl(req),
    ...emailResult,
  });
}

async function handleRevoke(
  adminClient: ReturnType<typeof createClient>,
  inviter: { role: string; laboratory: string },
  payload: InvitePayload,
) {
  const denied = assertCanManageInvites(inviter);
  if (denied) return denied;

  const inviteId = payload.invite_id;
  if (!inviteId) return json({ error: 'ID de invitación requerido', version: API_VERSION }, 403);

  let inviteQuery = adminClient
    .from('invites')
    .select('id, email, laboratory')
    .eq('id', inviteId)
    .is('accepted_at', null);

  if (inviter.role === 'admin') {
    inviteQuery = inviteQuery.eq('laboratory', inviter.laboratory);
  }

  const { data: invite, error: inviteErr } = await inviteQuery.maybeSingle();
  if (inviteErr) return json({ error: inviteErr.message, version: API_VERSION }, 400);
  if (!invite) return json({ error: 'Invitación no encontrada', version: API_VERSION }, 404);

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', invite.email)
    .maybeSingle();

  if (profile?.id) {
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(profile.id);
    if (deleteUserError) return json({ error: deleteUserError.message, version: API_VERSION }, 400);
  }

  const { error: deleteInviteError } = await adminClient.from('invites').delete().eq('id', inviteId);
  if (deleteInviteError) return json({ error: deleteInviteError.message, version: API_VERSION }, 400);

  return json({ ok: true, action: 'revoke', version: API_VERSION });
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
