import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

export function getSmtpConfig(): SmtpConfig | null {
  const host = Deno.env.get('SMTP_HOST');
  const port = Number(Deno.env.get('SMTP_PORT') || '587');
  const user = Deno.env.get('SMTP_USER');
  const password = Deno.env.get('SMTP_PASSWORD');
  const from = Deno.env.get('SMTP_FROM');

  if (!host || !user || !password || !from) return null;
  return { host, port, user, password, from };
}

export function getLoginUrl(req: Request): string {
  const siteUrl =
    Deno.env.get('PUBLIC_SITE_URL')?.replace(/\/$/, '') ||
    req.headers.get('origin')?.replace(/\/$/, '') ||
    'https://tonestrife.github.io';
  return `${siteUrl}/Cryovault/login`;
}

function buildCredentialsEmail(loginUrl: string, email: string, temporaryPassword: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; color: #1f2937; line-height: 1.5;">
  <h2 style="color: #2563eb;">Bienvenido a CryoVault</h2>
  <p>Tu administrador ha creado una cuenta para ti.</p>
  <p><strong>URL de acceso:</strong><br><a href="${loginUrl}">${loginUrl}</a></p>
  <p><strong>Email:</strong> ${email}</p>
  <p><strong>Contraseña provisional:</strong> <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">${temporaryPassword}</code></p>
  <p style="color:#6b7280;font-size:14px;">Por seguridad, deberás elegir una contraseña nueva la primera vez que inicies sesión.</p>
</body>
</html>`;
}

export async function sendCredentialsEmail(
  config: SmtpConfig,
  to: string,
  loginUrl: string,
  email: string,
  temporaryPassword: string,
): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: config.host,
      port: config.port,
      tls: config.port === 465,
      auth: {
        username: config.user,
        password: config.password,
      },
    },
  });

  try {
    await client.send({
      from: config.from,
      to,
      subject: 'Tu acceso a CryoVault',
      html: buildCredentialsEmail(loginUrl, email, temporaryPassword),
    });
  } finally {
    await client.close();
  }
}
