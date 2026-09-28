import { Router } from "express";
import type { Request } from "express";
import type { Me } from "@ott/shared";
import { loginSchema, signupSchema } from "@ott/shared";
import { prisma } from "../lib/db.js";
import { clearSessionCookie, hashPassword, setSessionCookie, verifyPassword } from "../lib/auth.js";
import { HttpError } from "../lib/errors.js";
import { PROFILE_COOKIE, currentProfile, toProfile } from "../lib/profiles.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const input = signupSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new HttpError(409, "email_taken", "An account with this email already exists");

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      profiles: { create: { name: input.name } },
    },
  });
  setSessionCookie(res, user.id);
  res.clearCookie(PROFILE_COOKIE, { path: "/" });
  req.userId = user.id;
  res.status(201).json(await loadMe(req));
});

authRouter.post("/login", async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new HttpError(401, "invalid_credentials", "Incorrect email or password");
  }
  setSessionCookie(res, user.id);
  req.userId = user.id;
  res.json(await loadMe(req));
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.clearCookie(PROFILE_COOKIE, { path: "/" });
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json(await loadMe(req));
});

export async function loadMe(req: Request): Promise<Me> {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    include: { profiles: { orderBy: { createdAt: "asc" } } },
  });
  if (!user) throw new HttpError(401, "unauthorized", "Sign in to continue");
  const profile = await currentProfile(req);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    profile: toProfile(profile),
    profiles: (user.profiles.length ? user.profiles : [profile]).map(toProfile),
  };
}
