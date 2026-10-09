import { z } from "zod";

export const displayNameSchema = z
  .string()
  .trim()
  .min(3, "Display name must be at least 3 characters.")
  .max(24, "Display name must be at most 24 characters.")
  .regex(/^[a-zA-Z0-9_]+$/, "Use only letters, numbers and underscores.");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be at most 72 characters."); // bcrypt limit

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
