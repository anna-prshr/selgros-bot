import type { Request } from "express";

export function checkApiKey(req: Request) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  const token = authHeader.replace("Bearer ", "");
  const expected = process.env.BOT_API_KEY;

  if (!expected || token !== expected) {
    throw new Error("Invalid API key");
  }
}
