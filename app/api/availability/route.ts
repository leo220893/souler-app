import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

type CourtId = "c1" | "c2" | "c3" | "c4" | "s1";

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const venueId = (searchParams.get("venueId") || "").trim();
    const date = (searchParams.get("date") || "").trim();

    if (!venueId) return jsonError(400, "Missing venueId");
    if (!date) return jsonError(400, "Missing date");

    // estructura final
    const occupied: Record<CourtId, number[]> = {
      c1: [],
      c2: [],
      c3: [],
      c4: [],
      s1: [],
    };

    // traer reservas confirmadas
    const snap = await adminDb
      .collection("reservations")
      .where("venueId", "==", venueId)
      .where("date", "==", date)
      .where("status", "==", "confirmed")
      .get();

    snap.docs.forEach((doc) => {
      const r: any = doc.data();

      const courtId = r.courtId as CourtId;
      const startHour = Number(r.startHour);
      const duration = Number(r.durationMin);

      if (!occupied[courtId]) return;

      // bloquea horas según duración
      if (duration === 120) {
        occupied[courtId].push(startHour);
        occupied[courtId].push(startHour + 1);
      } else {
        occupied[courtId].push(startHour);
      }
    });

    // ordenar horas
    (Object.keys(occupied) as CourtId[]).forEach((c) => {
      occupied[c] = [...new Set(occupied[c])].sort((a, b) => a - b);
    });

    return NextResponse.json({ occupied });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}