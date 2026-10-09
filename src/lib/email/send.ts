import nodemailer from "nodemailer";
import { brand } from "@/config/brand";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailProvider = "console" | "smtp" | "resend";

/** EMAIL_PROVIDER picks how mail is sent. Defaults to "console" (print to the server log). */
export function emailProvider(env: Record<string, string | undefined> = process.env): EmailProvider {
  const value = (env.EMAIL_PROVIDER ?? "console").toLowerCase();
  if (value === "console" || value === "smtp" || value === "resend") return value;
  throw new Error(`Unknown EMAIL_PROVIDER "${env.EMAIL_PROVIDER}". Use console, smtp or resend.`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (needed for EMAIL_PROVIDER=${process.env.EMAIL_PROVIDER}).`);
  return value;
}

let smtpTransport: nodemailer.Transporter | undefined;

function getSmtpTransport() {
  smtpTransport ??= nodemailer.createTransport({
    host: requireEnv("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: { user: requireEnv("SMTP_USER"), pass: requireEnv("SMTP_PASS") },
  });
  return smtpTransport;
}

async function sendWithResend(from: string, message: EmailMessage) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

/** Reserved test domains (RFC 2606) never reach a real mail server; tests sign up with them. */
export function isTestAddress(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return /^example\.(com|org|net)$/.test(domain) || domain.endsWith(".test") || domain.endsWith(".example");
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const provider = isTestAddress(message.to) ? "console" : emailProvider();
  const from = `${brand.emailFromName} <${process.env.EMAIL_FROM ?? "no-reply@localhost"}>`;

  switch (provider) {
    case "console":
      console.log(`\n[email] to: ${message.to}\n  subject: ${message.subject}\n${message.text.replace(/^/gm, "  ")}\n`);
      return;
    case "smtp":
      await getSmtpTransport().sendMail({ from, ...message });
      return;
    case "resend":
      await sendWithResend(from, message);
      return;
  }
}
