import { brand } from "@/config/brand";
import type { EmailMessage } from "./send";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function verificationEmail({ to, displayName, link }: { to: string; displayName: string; link: string }): EmailMessage {
  const name = escapeHtml(displayName);
  const href = escapeHtml(link);
  const brandName = escapeHtml(brand.name);
  return {
    to,
    subject: `Verify your email for ${brand.name}`,
    text: [
      `Hi ${displayName},`,
      "",
      "Confirm your email address to start registering for poker tournaments:",
      link,
      "",
      "This link expires in 24 hours. If you didn't sign up, you can ignore this email.",
      "",
      `${brand.name}: play money only, no real money is wagered or won.`,
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#eef2ef;font-family:Arial,Helvetica,sans-serif;color:#14181a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #cfd8d2;border-radius:10px">
    <tr><td style="padding:28px">
      <p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:#0f5132">${brandName}</p>
      <p style="margin:0 0 12px;font-size:15px">Hi ${name},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5">Confirm your email address to start registering for poker tournaments.</p>
      <p style="margin:0 0 24px"><a href="${href}" style="display:inline-block;padding:12px 20px;background:#e9c46a;color:#14181a;text-decoration:none;border-radius:6px;font-weight:bold">Verify email</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:#56605b">Or paste this link into your browser:</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${href}" style="color:#0f5132">${href}</a></p>
      <p style="margin:0;font-size:13px;color:#56605b">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>
    </td></tr>
  </table>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#56605b;text-align:center">Play money only: no real money is wagered or won.</p>
</body>
</html>`,
  };
}
