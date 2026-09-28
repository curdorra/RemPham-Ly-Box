import request from "supertest";
import type { CreateOrderInput, Order, TitleDetail } from "@ott/shared";
import { createApp } from "../src/app.js";

export const app = createApp();
export const DEVICE = "device-aaaaaaaa";

let counter = 0;
export const uniq = () => `${Date.now()}-${counter++}`;

type Agent = ReturnType<typeof request.agent>;

/** Signs up a fresh user and returns a cookie-carrying agent. */
export async function signUp() {
  const agent = request.agent(app);
  const email = `viewer${uniq()}@example.com`;
  const res = await agent.post("/auth/signup").send({ email, password: "correct-horse", name: "Viewer" });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, email, me: res.body };
}

export async function getTitle(slug: string): Promise<TitleDetail> {
  return (await request(app).get(`/catalog/titles/${slug}`).expect(200)).body;
}

/** Creates an order and pays for it with dev payments. */
export async function buy(agent: Agent, body: CreateOrderInput): Promise<Order> {
  const created = await agent.post("/orders").send(body);
  if (created.status !== 201) throw new Error(`order failed: ${created.status} ${JSON.stringify(created.body)}`);
  const paid = await agent.post(`/orders/${created.body.id}/confirm-dev`).expect(200);
  return paid.body;
}

/** A fresh user holding a paid STANDARD ticket for the given title. */
export async function userWithTicket(slug: string, tier: "STANDARD" | "TOGETHER" = "STANDARD") {
  const user = await signUp();
  const title = await getTitle(slug);
  const order = await buy(user.agent, { titleId: title.id, tier });
  return { ...user, title, order, ticket: order.tickets[0]! };
}
