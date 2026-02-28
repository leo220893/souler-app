import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const venueId = (searchParams.get("venueId") || "").trim();
    const date = (searchParams.get("date") || "").trim(); // YYYY-MM-DD

    if (!venueId) return jsonError(400, "Missing venueId");
    if (!date) return jsonError(400, "Missing date");

    // ✅ Query más robusta: primero por date (simple), después filtramos por venueId
    // (evita problemas de índices/estructuras y asegura que el público vea lo mismo)
    const snap = await adminDb.collection("reservations").where("date", "==", date).get();

    const reservations = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((r) => r.venueId === venueId)
      // 🔥 igual que admin: solo confirmed
      .filter((r) => (r.status ? r.status === "confirmed" : true))
      .sort((a, b) => (a.startHour ?? 0) - (b.startHour ?? 0));

    return NextResponse.json({ reservations });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}