"use client";

import { useEffect, useMemo, useState } from "react";

const VENUE_ID = "souler";

const COURTS = [
  { id: "c1", name: "Cancha 1", type: "doble" as const },
  { id: "c2", name: "Cancha 2", type: "doble" as const },
  { id: "c3", name: "Cancha 3", type: "doble" as const },
  { id: "c4", name: "Cancha 4", type: "doble" as const },
  { id: "s1", name: "Single", type: "single" as const },
];

type CourtId = (typeof COURTS)[number]["id"];
type CourtType = (typeof COURTS)[number]["type"];

type Availability = {
  occupied: Record<string, number[]>;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getSchedule(date: string) {
  const d = new Date(date + "T00:00:00");
  const day = d.getDay();

  if (day >= 1 && day <= 5) return { open: 8, close: 24 };
  if (day === 6) return { open: 8, close: 21 };
  return { open: 16, close: 22 };
}

function hh(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}

function clock(d: Date) {
  return d.toLocaleTimeString("es-AR");
}

function courtTheme(type: CourtType) {
  return type === "doble"
    ? {
        free: "bg-emerald-500 hover:bg-emerald-400 text-black",
        busy: "bg-white/10 text-white/60",
        badge: "bg-emerald-500/20 text-emerald-200",
      }
    : {
        free: "bg-cyan-500 hover:bg-cyan-400 text-black",
        busy: "bg-white/10 text-white/60",
        badge: "bg-cyan-500/20 text-cyan-200",
      };
}

export default function Page() {
  const [date, setDate] = useState(todayISO());
  const [availability, setAvailability] =
    useState<Availability | null>(null);
  const [durationMin, setDurationMin] = useState<60 | 120>(60);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const schedule = useMemo(() => getSchedule(date), [date]);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = schedule.open; h < schedule.close; h++) arr.push(h);
    return arr;
  }, [schedule]);

  async function loadAvailability() {
    const res = await fetch(
      `/api/availability?venueId=${VENUE_ID}&date=${date}`
    );
    const data = await res.json();
    setAvailability(data);
  }

  useEffect(() => {
    loadAvailability();
  }, [date]);

  function isPast(hour: number) {
    if (date !== todayISO()) return false;
    return hour <= now.getHours();
  }

  function isFree(courtId: CourtId, hour: number) {
    const occupied = availability?.occupied?.[courtId] || [];

    if (isPast(hour)) return false;

    if (durationMin === 60)
      return !occupied.includes(hour);

    return (
      !occupied.includes(hour) &&
      !occupied.includes(hour + 1)
    );
  }

  async function reserve(courtId: CourtId, hour: number) {
    const name = prompt("Nombre");
    if (!name) return;

    const phone = prompt("Teléfono");
    if (!phone) return;

    await fetch("/api/reservations/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venueId: VENUE_ID,
        courtId,
        date,
        startHour: hour,
        durationMin,
        customerName: name,
        customerPhone: phone,
      }),
    });

    loadAvailability();
  }

  return (
    <main className="min-h-screen bg-[#070B0A] text-white p-6">
      {/* HEADER */}
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-extrabold">
            Souler Padel
          </h1>

          <p className="text-white/60 text-sm mt-1">
            Reservá tu cancha online
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs text-white/60">
            Hora actual
          </div>
          <div className="font-mono text-2xl">
            {clock(now)}
          </div>
        </div>
      </header>

      {/* CONTROLES */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-black/40 border border-white/10 px-3 py-2 rounded-lg"
        />

        <div className="flex rounded-lg overflow-hidden border border-white/10">
          <button
            onClick={() => setDurationMin(60)}
            className={`px-4 py-2 ${
              durationMin === 60
                ? "bg-white text-black"
                : ""
            }`}
          >
            60 min
          </button>

          <button
            onClick={() => setDurationMin(120)}
            className={`px-4 py-2 ${
              durationMin === 120
                ? "bg-white text-black"
                : ""
            }`}
          >
            120 min
          </button>
        </div>
      </div>

      {/* CANCHAS */}
      <div className="grid md:grid-cols-2 gap-6">
        {COURTS.map((court) => {
          const theme = courtTheme(court.type);

          return (
            <div
              key={court.id}
              className="bg-white/5 border border-white/10 rounded-xl p-4"
            >
              <div className="flex justify-between mb-4">
                <h2 className="font-semibold">
                  {court.name}
                </h2>

                <span
                  className={`px-3 py-1 rounded-full text-xs ${theme.badge}`}
                >
                  {court.type}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {hours.map((h) => {
                  const free = isFree(
                    court.id as CourtId,
                    h
                  );

                  return (
                    <button
                      key={h}
                      disabled={!free}
                      onClick={() =>
                        reserve(
                          court.id as CourtId,
                          h
                        )
                      }
                      className={`rounded-lg py-2 text-sm font-semibold transition ${
                        free
                          ? theme.free
                          : theme.busy
                      }`}
                    >
                      {hh(h)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}