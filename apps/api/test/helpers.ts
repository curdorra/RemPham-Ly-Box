import request from "supertest";
import { createApp } from "../src/app.js";

export const app = createApp();

let counter = 0;

/** Signs up a fresh user and returns a cookie-carrying agent. */
export async function signUp() {
  const agent = request.agent(app);
  const email = `viewer${Date.now()}-${counter++}@example.com`;
  const res = await agent.post("/auth/signup").send({ email, password: "correct-horse", name: "Viewer" });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, email, me: res.body };
}

export async function subscribedUser() {
  const user = await signUp();
  await user.agent.post("/billing/checkout").send({ planId: "standard" }).expect(200);
  return user;
}
