import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import jwt from "jsonwebtoken";

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) return NextResponse.json({ error: "Missing ADMIN_JWT_SECRET" }, { status: 500 });

    try {
      jwt.verify(token, secret);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const venueId = String(body?.venueId || "souler").trim();
    const date = String(body?.date || "").trim(); // YYYY-MM-DD opcional

    let q = adminDb.collection("reservationSlots").where("venueId", "==", venueId);
    if (date) q = q.where("date", "==", date);

    const snap = await q.limit(500).get();

    let checked = 0;
    let deleted = 0;

    // OJO: batch máximo 500 operaciones
    const batch = adminDb.batch();

    for (const d of snap.docs) {
      checked++;
      const s: any = d.data();
      const reservationId = String(s.reservationId || "").trim();

      if (!reservationId) {
        batch.delete(d.ref);
        deleted++;
        continue;
      }

      const rref = adminDb.collection("reservations").doc(reservationId);
      const rsnap = await rref.get();

      if (!rsnap.exists) {
        batch.delete(d.ref);
        deleted++;
        continue;
      }

      const r: any = rsnap.data();
      if (r?.status === "cancelled") {
        batch.delete(d.ref);
        deleted++;
      }
    }

    await batch.commit();

    return NextResponse.json({ ok: true, checked, deleted });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}