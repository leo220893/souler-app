import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId") || "souler";
    const date = searchParams.get("date"); // YYYY-MM-DD

    if (!date) {
      return NextResponse.json({ error: "Falta date" }, { status: 400 });
    }

    const snap = await adminDb
      .collection("reservationSlots")
      .where("venueId", "==", venueId)
      .where("date", "==", date)
      .get();

    const slots = snap.docs.map((d) => d.data()).map((s) => ({
      courtId: s.courtId as "c1" | "c2" | "c3",
      hour: Number(s.hour),
      reservationId: String(s.reservationId || ""),
    }));

    return NextResponse.json({ ok: true, slots });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}