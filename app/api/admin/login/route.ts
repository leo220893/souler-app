import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const pin = String((body as any)?.pin ?? "");

  const ADMIN_PIN = process.env.ADMIN_PIN || "";
  const SECRET = process.env.ADMIN_JWT_SECRET || "";

  if (!ADMIN_PIN || !SECRET) {
    return NextResponse.json(
      { error: "Faltan ADMIN_PIN / ADMIN_JWT_SECRET en .env.local" },
      { status: 500 }
    );
  }

  if (pin !== ADMIN_PIN) {
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }

  const token = jwt.sign({ role: "admin" }, SECRET, { expiresIn: "7d" });

  return NextResponse.json({ token });
}