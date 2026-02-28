import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

type CourtId = "c1" | "c2" | "c3" | "c4" | "s1";

/*
c1–c4 = Dobles
s1     = Single
*/

function getScheduleForDate(dateStr: string) {
  // 0 domingo — 6 sábado
  const d = new Date(`${dateStr}T00:00:00-03:00`);
  const day = d.getDay();

  // Lunes a Viernes
  if (day >= 1 && day <= 5)
    return { openHour: 8, closeHour: 24 };

  // Sábado
  if (day === 6)
    return { openHour: 8, closeHour: 21 };

  // Domingo
  return { openHour: 16, closeHour: 22 };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      venueId = "souler",
      courtId,
      date,
      startHour,
      durationMin,
      customerName,
      customerPhone,
      notes = "",
      source = "web",
    } = body as {
      venueId?: string;
      courtId: CourtId;
      date: string;
      startHour: number;
      durationMin: 60 | 120;
      customerName: string;
      customerPhone: string;
      notes?: string;
      source?: "web" | "admin";
    };

    /* =========================
       VALIDACIONES
    ========================= */

    if (venueId !== "souler") {
      return NextResponse.json(
        { error: "venue inválido" },
        { status: 400 }
      );
    }

    if (!["c1", "c2", "c3", "c4", "s1"].includes(courtId)) {
      return NextResponse.json(
        { error: "cancha inválida" },
        { status: 400 }
      );
    }

    if (![60, 120].includes(durationMin)) {
      return NextResponse.json(
        { error: "duración inválida" },
        { status: 400 }
      );
    }

    if (!date) {
      return NextResponse.json(
        { error: "date inválida" },
        { status: 400 }
      );
    }

    if (typeof startHour !== "number") {
      return NextResponse.json(
        { error: "startHour inválido" },
        { status: 400 }
      );
    }

    if (!customerName?.trim() || !customerPhone?.trim()) {
      return NextResponse.json(
        { error: "faltan datos del cliente" },
        { status: 400 }
      );
    }

    /* =========================
       HORARIOS SEGÚN DÍA
    ========================= */

    const { openHour, closeHour } =
      getScheduleForDate(date);

    const latestStart =
      durationMin === 60
        ? closeHour - 1
        : closeHour - 2;

    if (
      startHour < openHour ||
      startHour > latestStart
    ) {
      return NextResponse.json(
        { error: "fuera de horario" },
        { status: 400 }
      );
    }

    /* =========================
       HORAS A BLOQUEAR
    ========================= */

    const hoursToBlock =
      durationMin === 120
        ? [startHour, startHour + 1]
        : [startHour];

    const startLocalISO =
      `${date}T${String(startHour).padStart(2, "0")}:00:00-03:00`;

    const startAt = new Date(startLocalISO);
    const endAt = new Date(
      startAt.getTime() + durationMin * 60000
    );

    const reservationRef =
      adminDb.collection("reservations").doc();

    /* =========================
       TRANSACTION FIRESTORE
    ========================= */

    await adminDb.runTransaction(async (tx) => {

      // verificar slots libres
      for (const h of hoursToBlock) {
        const slotId =
          `${venueId}_${date}_${courtId}_${h}`;

        const slotRef =
          adminDb.collection("reservationSlots")
            .doc(slotId);

        const snap = await tx.get(slotRef);

        if (snap.exists) {
          throw new Error(
            "Ese horario ya está ocupado"
          );
        }
      }

      // crear reserva
      tx.set(reservationRef, {
        venueId,
        courtId,
        date,
        startHour,
        durationMin,
        startAt,
        endAt,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        notes: String(notes || "").trim(),
        status: "confirmed",
        source,
        createdAt: new Date(),
      });

      // crear slots bloqueados
      for (const h of hoursToBlock) {
        const slotId =
          `${venueId}_${date}_${courtId}_${h}`;

        const slotRef =
          adminDb.collection("reservationSlots")
            .doc(slotId);

        tx.set(slotRef, {
          venueId,
          date,
          courtId,
          hour: h,
          reservationId: reservationRef.id,
          createdAt: new Date(),
        });
      }
    });

    return NextResponse.json({
      ok: true,
      id: reservationRef.id,
    });

  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "error" },
      { status: 500 }
    );
  }
}