import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import jwt from "jsonwebtoken";

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function GET(req: NextRequest) {
  try {
    // Auth
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) return NextResponse.json({ error: "Missing ADMIN_JWT_SECRET" }, { status: 500 });

    try {
      jwt.verify(token, secret);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Params
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId");
    const date = searchParams.get("date");
    const includeCancelled = searchParams.get("includeCancelled") === "1"; // opcional

    if (!venueId) return NextResponse.json({ error: "Missing venueId" }, { status: 400 });
    if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

    // Query
    let q = adminDb
      .collection("reservations")
      .where("venueId", "==", venueId)
      .where("date", "==", date);

    // 🔥 FILTRO CLAVE
    if (!includeCancelled) {
      q = q.where("status", "==", "confirmed");
    }

    const snap = await q.get();
    const reservations = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    return NextResponse.json({ reservations });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}