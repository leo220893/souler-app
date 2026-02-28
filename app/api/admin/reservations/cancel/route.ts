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

    // Body
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const venueId = String(body?.venueId || "").trim();

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (!venueId) return NextResponse.json({ error: "Missing venueId" }, { status: 400 });

    const ref = adminDb.collection("reservations").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

    const r = snap.data() as any;

    // Validación de venue
    if (String(r.venueId || "").trim() !== venueId) {
      return NextResponse.json({ error: "venueId mismatch" }, { status: 400 });
    }

    const courtId = String(r.courtId || "").trim();
    const date = String(r.date || "").trim();
    const startHour = Number(r.startHour);
    const durationMin = Number(r.durationMin);

    if (!courtId || !date || !Number.isFinite(startHour) || !Number.isFinite(durationMin)) {
      return NextResponse.json({ error: "Reservation data incomplete" }, { status: 500 });
    }

    const hoursToFree = durationMin === 120 ? [startHour, startHour + 1] : [startHour];

    await adminDb.runTransaction(async (tx) => {
      // 1) Marcar reserva como cancelada
      tx.update(ref, {
        status: "cancelled",
        cancelledAt: new Date(),
      });

      // 2) Borrar slots para liberar el horario
      for (const h of hoursToFree) {
        const slotId = `${venueId}_${date}_${courtId}_${h}`;
        const slotRef = adminDb.collection("reservationSlots").doc(slotId);
        tx.delete(slotRef);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}