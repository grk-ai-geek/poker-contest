import { describe, expect, it } from "vitest";
import { emailProvider, isTestAddress } from "@/lib/email/send";
import { verificationEmail } from "@/lib/email/templates";

describe("emailProvider", () => {
  it("defaults to console", () => {
    expect(emailProvider({})).toBe("console");
  });
  it("accepts smtp and resend in any case", () => {
    expect(emailProvider({ EMAIL_PROVIDER: "SMTP" })).toBe("smtp");
    expect(emailProvider({ EMAIL_PROVIDER: "resend" })).toBe("resend");
  });
  it("rejects unknown providers", () => {
    expect(() => emailProvider({ EMAIL_PROVIDER: "carrier-pigeon" })).toThrow(/Unknown EMAIL_PROVIDER/);
  });
});

describe("isTestAddress", () => {
  it.each(["e2e@example.com", "a@EXAMPLE.org", "x@foo.test"])("%s is a test address", (email) => {
    expect(isTestAddress(email)).toBe(true);
  });
  it.each(["someone@gmail.com", "a@example.co", "b@notexample.com"])("%s is a real address", (email) => {
    expect(isTestAddress(email)).toBe(false);
  });
});

describe("verificationEmail", () => {
  const link = "http://localhost:3000/verify?token=abc&x=1";
  const msg = verificationEmail({ to: "t@example.com", displayName: "river_rat", link });

  it("includes the link in text and html", () => {
    expect(msg.text).toContain(link);
    expect(msg.html).toContain("verify?token=abc&amp;x=1");
  });
  it("escapes the display name in html", () => {
    const evil = verificationEmail({ to: "t@example.com", displayName: "<script>", link });
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).toContain("&lt;script&gt;");
  });
});
