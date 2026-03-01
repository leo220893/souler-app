"use client";

import React, { useEffect, useMemo, useState } from "react";

type VenueId = "souler";
type CourtId = "c1" | "c2" | "c3" | "c4" | "s1";
type Duration = 60;

type AvailabilityResponse = {
  occupied: Record<CourtId, number[]>;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function formatHMS(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// Horarios según día (igual criterio que tu backend create)
function getScheduleForDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00-03:00`);
  const day = d.getDay(); // 0 dom - 6 sab

  if (day >= 1 && day <= 5) return { openHour: 8, closeHour: 24 };
  if (day === 6) return { openHour: 8, closeHour: 21 };
  return { openHour: 16, closeHour: 22 };
}

function buildSlots(openHour: number, closeHour: number) {
  const arr: number[] = [];
  for (let h = openHour; h < closeHour; h++) arr.push(h);
  return arr;
}

// Pelotita (SVG)
function BallIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="g" cx="30%" cy="25%" r="70%">
          <stop offset="0%" stopColor="#d8ff5c" />
          <stop offset="70%" stopColor="#96f000" />
          <stop offset="100%" stopColor="#59b800" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#g)" />
      <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="2" />
      <path
        d="M13 22c7 2 12 7 14 14"
        fill="none"
        stroke="rgba(255,255,255,.85)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M51 42c-7-2-12-7-14-14"
        fill="none"
        stroke="rgba(255,255,255,.85)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0a1011] shadow-[0_20px_60px_-25px_rgba(0,0,0,0.85)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="text-lg font-semibold text-white">{title}</div>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-white/70 hover:bg-white/10"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const venueId: VenueId = "souler";
  const duration: Duration = 60; // ✅ fijo 60 (sin opción 120)

  const [date, setDate] = useState<string>(() => toYMD(new Date()));
  const [now, setNow] = useState<Date | null>(null); // para evitar hydration mismatch

  const [occupied, setOccupied] = useState<Record<CourtId, number[]>>({
    c1: [],
    c2: [],
    c3: [],
    c4: [],
    s1: [],
  });

  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ courtId: CourtId; startHour: number } | null>(null);

  // Modal / form reserva
  const [modalOpen, setModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const schedule = useMemo(() => getScheduleForDate(date), [date]);
  const slots = useMemo(
    () => buildSlots(schedule.openHour, schedule.closeHour),
    [schedule.openHour, schedule.closeHour]
  );

  const courts = useMemo(
    () =>
      [
        { id: "c1" as const, name: "Cancha 1", kind: "doble" as const },
        { id: "c2" as const, name: "Cancha 2", kind: "doble" as const },
        { id: "c3" as const, name: "Cancha 3", kind: "doble" as const },
        { id: "c4" as const, name: "Cancha 4", kind: "doble" as const },
        { id: "s1" as const, name: "Single", kind: "single" as const },
      ] as const,
    []
  );

  // reloj (client-only)
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Traer availability cuando cambia fecha
  async function refreshAvailability(currentDate = date) {
    setLoading(true);
    try {
      const res = await fetch(`/api/availability?venueId=${venueId}&date=${currentDate}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as AvailabilityResponse;

      setOccupied({
        c1: data?.occupied?.c1 ?? [],
        c2: data?.occupied?.c2 ?? [],
        c3: data?.occupied?.c3 ?? [],
        c4: data?.occupied?.c4 ?? [],
        s1: data?.occupied?.s1 ?? [],
      });
    } catch {
      setOccupied({ c1: [], c2: [], c3: [], c4: [], s1: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelected(null);
    refreshAvailability(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // No permitir horas pasadas SOLO si la fecha elegida es hoy
  const isToday = useMemo(() => {
    if (!now) return false;
    return date === toYMD(now);
  }, [date, now]);

  function hourIsPast(h: number) {
    if (!now) return false;
    if (!isToday) return false;
    return h <= now.getHours();
  }

  function isOccupied(courtId: CourtId, h: number) {
    return (occupied[courtId] || []).includes(h);
  }

  function outOfScheduleByDuration(h: number) {
    const latestStart = schedule.closeHour - 1; // 60 min
    return h < schedule.openHour || h > latestStart;
  }

  function canPick(courtId: CourtId, h: number) {
    if (outOfScheduleByDuration(h)) return false;
    if (hourIsPast(h)) return false;
    if (isOccupied(courtId, h)) return false;
    return true;
  }

  function openReserve() {
    if (!selected) return;
    setModalOpen(true);
  }

  async function submitReservation() {
    if (!selected) return;

    const name = customerName.trim();
    const phone = customerPhone.trim();
    if (!name || !phone) {
      setToast({ type: "err", msg: "Completá nombre y teléfono." });
      return;
    }

    setSubmitting(true);
    setToast(null);
    try {
      const res = await fetch("/api/reservations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          courtId: selected.courtId,
          date,
          startHour: selected.startHour,
          durationMin: 60,
          customerName: name,
          customerPhone: phone,
          notes: notes.trim(),
          source: "web",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setToast({ type: "err", msg: data?.error || "No se pudo reservar." });
        return;
      }

      setToast({ type: "ok", msg: "✅ Reserva confirmada." });
      setModalOpen(false);
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");

      await refreshAvailability(date);
    } catch {
      setToast({ type: "err", msg: "Error de red. Reintentá." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen text-white">
      {/* Fondo deportivo + textura */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#060b0c]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1416] via-[#060b0c] to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,197,94,.20),transparent_40%),radial-gradient(circle_at_80%_15%,rgba(59,130,246,.16),transparent_45%),radial-gradient(circle_at_50%_90%,rgba(34,197,94,.10),transparent_55%)]" />
        <div className="absolute inset-0 opacity-[0.10] mix-blend-overlay bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22 x=%220%22 y=%220%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%223%22 stitchTiles=%22stitch%22/></filter><rect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22 opacity=%220.55%22/></svg>')]" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <BallIcon className="h-10 w-10 drop-shadow" />
              <h1 className="text-3xl font-bold tracking-tight">Souler Padel</h1>
            </div>
            <p className="text-white/70 mt-1">Reservá tu cancha online</p>
          </div>

          <div className="flex items-center gap-3 justify-between sm:justify-end">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <div className="text-xs text-white/60">Hora actual</div>
              <div className="font-mono text-xl leading-tight">{now ? formatHMS(now) : "—:—:—"}</div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-white shadow-sm outline-none focus:ring-2 focus:ring-emerald-400/30"
            />

            {/* ✅ Sin selector 120 min */}
            <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white/70">
              Duración: <span className="font-semibold text-white">60 min</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-sm text-white/60">{loading ? "Cargando…" : "Seleccioná un horario"}</div>

            {/* ✅ Botón Reservar */}
            <button
              onClick={openReserve}
              disabled={!selected}
              className={[
                "ml-2 rounded-xl px-4 py-2 font-semibold transition",
                !selected
                  ? "bg-white/10 text-white/30 cursor-not-allowed border border-white/10"
                  : "bg-white text-black hover:bg-white/90",
              ].join(" ")}
            >
              Reservar
            </button>
          </div>
        </div>

        {/* Grid de canchas */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {courts.map((c) => {
            const badge =
              c.kind === "doble"
                ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/25"
                : "bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/25";

            return (
              <div
                key={c.id}
                className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.7)]"
              >
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold">{c.name}</div>
                  <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${badge}`}>{c.kind}</span>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {slots
                    .filter((h) => !outOfScheduleByDuration(h))
                    .map((h) => {
                      const disabled = !canPick(c.id, h);
                      const picked = selected?.courtId === c.id && selected?.startHour === h;

                      const base =
                        c.kind === "doble"
                          ? "bg-emerald-500/70 hover:bg-emerald-500/80"
                          : "bg-sky-500/70 hover:bg-sky-500/80";

                      const disabledCls = "bg-white/5 text-white/25 cursor-not-allowed border border-white/5";
                      const pickedCls = "ring-2 ring-white/70 shadow-[0_0_0_1px_rgba(255,255,255,0.15)]";

                      return (
                        <button
                          key={h}
                          disabled={disabled}
                          onClick={() => setSelected({ courtId: c.id, startHour: h })}
                          className={[
                            "rounded-lg px-2 py-2 text-sm font-semibold transition",
                            "border border-white/10 shadow-sm",
                            disabled ? disabledCls : `${base} text-black`,
                            picked ? pickedCls : "",
                          ].join(" ")}
                          title={
                            disabled
                              ? hourIsPast(h)
                                ? "Horario pasado"
                                : isOccupied(c.id, h)
                                ? "Ocupado"
                                : "No disponible"
                              : "Disponible"
                          }
                        >
                          {pad2(h)}:00
                        </button>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Resumen */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-white/80">
              {selected ? (
                <>
                  Selección:{" "}
                  <span className="font-semibold text-white">
                    {selected.courtId.toUpperCase()} — {date} — {pad2(selected.startHour)}:00 (60 min)
                  </span>
                </>
              ) : (
                <span className="text-white/60">Todavía no seleccionaste horario.</span>
              )}
            </div>

            <div className="text-xs text-white/50">* Los horarios pasados (solo hoy) quedan bloqueados.</div>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={[
              "mt-4 rounded-xl border px-4 py-3 text-sm",
              toast.type === "ok"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                : "border-rose-400/30 bg-rose-500/10 text-rose-100",
            ].join(" ")}
          >
            {toast.msg}
          </div>
        )}
      </div>

      {/* Modal Reserva */}
      <Modal
        open={modalOpen}
        title="Confirmar reserva"
        onClose={() => (submitting ? null : setModalOpen(false))}
      >
        {selected ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.05] p-3 text-sm text-white/80">
              <div className="font-semibold text-white">Detalle</div>
              <div className="mt-1">
                {selected.courtId.toUpperCase()} — {date} — {pad2(selected.startHour)}:00 — 60 min
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-white/60 mb-1">Nombre</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-400/30"
                  placeholder="Tu nombre"
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Teléfono</label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-400/30"
                  placeholder="Ej: 11..."
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/60 mb-1">Notas (opcional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full min-h-[90px] rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-400/30"
                placeholder="Ej: pago en el lugar, etc."
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="rounded-xl px-4 py-2 text-white/80 hover:bg-white/10 border border-white/10 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={submitReservation}
                disabled={submitting}
                className="rounded-xl px-4 py-2 font-semibold bg-white text-black hover:bg-white/90 disabled:opacity-50"
              >
                {submitting ? "Reservando..." : "Confirmar"}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-white/70">Primero elegí un horario.</div>
        )}
      </Modal>
    </div>
  );
}