import { Router } from "express";
import { profileCreateSchema, profileUpdateSchema, selectProfileSchema } from "@ott/shared";
import { Prisma } from "../generated/prisma/client.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import { prisma } from "../lib/db.js";
import { HttpError, notFound } from "../lib/errors.js";
import { MAX_PROFILES, setProfileCookie, toProfile } from "../lib/profiles.js";
import { requireAuth } from "../middleware/auth.js";

export const profilesRouter = Router();
profilesRouter.use(requireAuth);

const nameTaken = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

profilesRouter.get("/", async (req, res) => {
  const profiles = await prisma.profile.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: "asc" } });
  res.json(profiles.map(toProfile));
});

profilesRouter.post("/", async (req, res) => {
  const input = profileCreateSchema.parse(req.body);
  const count = await prisma.profile.count({ where: { userId: req.userId! } });
  if (count >= MAX_PROFILES) throw new HttpError(409, "too_many_profiles", `An account can have up to ${MAX_PROFILES} profiles`);
  try {
    const profile = await prisma.profile.create({ data: { userId: req.userId!, ...input } });
    res.status(201).json(toProfile(profile));
  } catch (e) {
    if (nameTaken(e)) throw new HttpError(409, "profile_name_taken", "You already have a profile with that name");
    throw e;
  }
});

async function ownProfile(id: string, userId: string) {
  const profile = await prisma.profile.findFirst({ where: { id, userId } });
  if (!profile) throw notFound("Profile");
  return profile;
}

const wrongPin = () => new HttpError(403, "wrong_pin", "That PIN is not right");

profilesRouter.patch("/:id", async (req, res) => {
  const { pin, currentPin, ...fields } = profileUpdateSchema.parse(req.body);
  const profile = await ownProfile(req.params.id, req.userId!);
  const data: Prisma.ProfileUpdateInput = { ...fields };
  if (pin !== undefined) {
    // Changing or removing an existing PIN takes the old one.
    if (profile.pinHash && !(currentPin && (await verifyPassword(currentPin, profile.pinHash)))) throw wrongPin();
    data.pinHash = pin === null ? null : await hashPassword(pin);
  }
  try {
    res.json(toProfile(await prisma.profile.update({ where: { id: profile.id }, data })));
  } catch (e) {
    if (nameTaken(e)) throw new HttpError(409, "profile_name_taken", "You already have a profile with that name");
    throw e;
  }
});

profilesRouter.delete("/:id", async (req, res) => {
  const profile = await ownProfile(req.params.id, req.userId!);
  const count = await prisma.profile.count({ where: { userId: req.userId! } });
  if (count <= 1) throw new HttpError(409, "last_profile", "An account needs at least one profile");
  await prisma.profile.delete({ where: { id: profile.id } });
  res.status(204).end();
});

/** "Who's watching?" — remembers the choice in a cookie. */
profilesRouter.put("/current", async (req, res) => {
  const { profileId, pin } = selectProfileSchema.parse(req.body);
  const profile = await ownProfile(profileId, req.userId!);
  if (profile.pinHash && !(pin && (await verifyPassword(pin, profile.pinHash)))) throw wrongPin();
  setProfileCookie(res, profile.id);
  res.json(toProfile(profile));
});
