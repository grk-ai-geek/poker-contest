import { describe, expect, it } from "vitest";
import { signUpSchema } from "@/lib/validation/auth";

const valid = { email: "Trader@Example.com ", password: "password123", displayName: "qqq_bull" };

describe("signUpSchema", () => {
  it("accepts valid input and normalizes the email", () => {
    const result = signUpSchema.parse(valid);
    expect(result.email).toBe("trader@example.com");
  });

  it("rejects a bad email", () => {
    expect(signUpSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects short passwords", () => {
    expect(signUpSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });

  it.each(["ab", "has space", "emoji🙂", "a".repeat(25)])("rejects display name %j", (displayName) => {
    expect(signUpSchema.safeParse({ ...valid, displayName }).success).toBe(false);
  });
});
