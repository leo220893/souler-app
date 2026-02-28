export type CourtId = "c1" | "c2" | "c3";

export async function createReservation(params: {
  venueId: "souler";
  courtId: CourtId;
  date: string;
  startHour: number;
  durationMin: 60 | 120;
  customerName: string;
  customerPhone: string;
  notes?: string;
  source?: "web" | "admin";
}) {
  const res = await fetch("/api/reservations/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "No se pudo reservar");
  return data.id as string;
}