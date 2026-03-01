"use client";

import React, { useEffect, useMemo, useState } from "react";

type CourtId = "c1" | "c2" | "c3" | "c4" | "s1";
type Status = "confirmed" | "cancelled";

type Reservation = {
  id: string;
  venueId: string;
  courtId: CourtId;
  date: string; // YYYY-MM-DD
  startHour: number;
  durationMin: 60 | 120;
  customerName: string;
  customerPhone: string;
  notes?: string;
  status?: Status;
  source?: "web" | "admin";
  createdAt?: any;
  cancelledAt?: any;
};

const VENUE_ID = "souler";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatHour(h: number) {
  return `${pad2(h)}:00`;
}

function formatRange(startHour: number, durationMin: number) {
  const end = startHour + Math.floor(durationMin / 60);
  return `${formatHour(startHour)} – ${formatHour(end)}`;
}

function todayAR(): string {
  // Fecha local AR para input date (YYYY-MM-DD)
  const d = new Date();
  const y = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return y;
}

/**
 * Normaliza teléfonos AR para WhatsApp.
 * - saca todo lo que no sea dígito
 * - si empieza con 0 lo quita
 * - si empieza con 15 lo quita (formato viejo “15xxxx”)
 * - si no empieza con 54, lo agrega (Argentina)
 *
 * Devuelve E.164 sin +: 54XXXXXXXXXX
 */
function normalizePhoneForWhatsApp(raw: string): string {
  let digits = (raw || "").replace(/\D+/g, "");

  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("15")) digits = digits.slice(2);

  if (!digits.startsWith("54")) {
    digits = `54${digits}`;
  }

  return digits;
}

function whatsappLink(rawPhone: string) {
  const phone = normalizePhoneForWhatsApp(rawPhone);
  // wa.me funciona en desktop y móvil (en desktop suele abrir WhatsApp Web)
  return `https://wa.me/${phone}`;
}

function courtLabel(courtId: CourtId) {
  if (courtId === "s1") return "Single";
  return `Doble ${courtId.toUpperCase()}`;
}

function courtPillClass(courtId: CourtId) {
  // colores distintos: dobles vs single
  if (courtId === "s1") {
    return "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30";
  }
  return "bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/30";
}

function cardByStatus(status?: Status) {
  if (status === "cancelled") {
    return "bg-white/5 ring-1 ring-white/10 opacity-70";
  }
  return "bg-white/10 ring-1 ring-white/15 hover:ring-white/25";
}

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* content */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-xl rounded-2xl bg-zinc-950 ring-1 ring-white/15 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="text-white font-semibold">{title}</div>
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 text-white"
            >
              Cerrar
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [pin, setPin] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [date, setDate] = useState<string>(todayAR());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [includeCancelled, setIncludeCancelled] = useState(false);

  const [selected, setSelected] = useState<Reservation | null>(null);
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);

  // estilo "deportivo" similar: fondo + textura
  const bg = useMemo(
    () => ({
      background:
        "radial-gradient(1000px 600px at 10% 0%, rgba(56,189,248,.25), transparent 60%)," +
        "radial-gradient(900px 600px at 100% 20%, rgba(16,185,129,.22), transparent 60%)," +
        "radial-gradient(900px 700px at 40% 100%, rgba(244,63,94,.18), transparent 60%)," +
        "linear-gradient(to bottom, rgba(0,0,0,.9), rgba(0,0,0,.95))",
    }),
    []
  );

  async function login() {
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Login failed (${res.status})`);
      setToken(data.token);
    } catch (e: any) {
      setLoginError(e?.message || "Error");
    }
  }

  async function fetchReservations() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const url =
        `/api/admin/reservations?venueId=${encodeURIComponent(VENUE_ID)}` +
        `&date=${encodeURIComponent(date)}` +
        (includeCancelled ? `&includeCancelled=1` : "");
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          `No se pudo traer reservas (${res.status}). ${JSON.stringify(data)}`
        );
      setReservations(Array.isArray(data.reservations) ? data.reservations : []);
    } catch (e: any) {
      setErr(e?.message || "Error");
      setReservations([]);
    } finally {
      setLoading(false);
    }
  }

  async function cancelReservation(r: Reservation) {
    if (!token) return;
    setCancelBusyId(r.id);
    try {
      const res = await fetch("/api/admin/reservations/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: r.id, venueId: r.venueId || VENUE_ID }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Cancel failed (${res.status})`);

      // refrescar lista
      await fetchReservations();

      // si justo estaba abierto el modal de esa reserva, cerralo
      setSelected((prev) => (prev?.id === r.id ? null : prev));
    } catch (e: any) {
      alert(`✖ ${e?.message || "Error"}`);
    } finally {
      setCancelBusyId(null);
    }
  }

  useEffect(() => {
    if (!token) return;
    fetchReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, date, includeCancelled]);

  const sorted = useMemo(() => {
    return [...reservations].sort((a, b) => {
      const aa = (a.startHour ?? 0) - (b.startHour ?? 0);
      if (aa !== 0) return aa;
      return String(a.courtId).localeCompare(String(b.courtId));
    });
  }, [reservations]);

  return (
    <div className="min-h-screen text-white" style={bg}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🎾</div>
            <div>
              <div className="text-2xl font-extrabold tracking-tight">Souler</div>
              <div className="text-white/70 text-sm">Panel Administrador</div>
            </div>
          </div>

          {token ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setToken(null);
                  setPin("");
                }}
                className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm"
              >
                Salir
              </button>
            </div>
          ) : null}
        </header>

        {!token ? (
          <div className="mt-8 max-w-md rounded-2xl bg-white/10 ring-1 ring-white/15 p-5">
            <div className="font-semibold">Ingresar</div>
            <div className="text-white/70 text-sm mt-1">
              Escribí tu PIN de administrador
            </div>
            <div className="mt-4 flex gap-2">
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
                className="w-full rounded-xl bg-black/40 ring-1 ring-white/15 px-4 py-2 outline-none focus:ring-white/30"
              />
              <button
                onClick={login}
                className="rounded-xl bg-emerald-500/80 hover:bg-emerald-500 px-4 py-2 font-semibold"
              >
                Entrar
              </button>
            </div>
            {loginError ? (
              <div className="mt-3 text-sm text-rose-300">✖ {loginError}</div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-white/10 ring-1 ring-white/15 p-5">
                <div className="font-semibold">Fecha</div>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="rounded-xl bg-black/40 ring-1 ring-white/15 px-4 py-2 outline-none focus:ring-white/30"
                  />
                  <button
                    onClick={fetchReservations}
                    className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm"
                    disabled={loading}
                  >
                    {loading ? "Actualizando..." : "Actualizar"}
                  </button>
                </div>

                <label className="mt-4 flex items-center gap-2 text-sm text-white/80 select-none">
                  <input
                    type="checkbox"
                    checked={includeCancelled}
                    onChange={(e) => setIncludeCancelled(e.target.checked)}
                  />
                  Mostrar canceladas
                </label>

                {err ? (
                  <div className="mt-3 text-sm text-rose-300">{err}</div>
                ) : null}
              </div>

              <div className="rounded-2xl bg-white/10 ring-1 ring-white/15 p-5 md:col-span-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">Reservas</div>
                    <div className="text-white/70 text-sm">
                      Tocá una reserva para ver el detalle completo
                    </div>
                  </div>
                  <div className="text-sm text-white/70">
                    {sorted.length} turno{sorted.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sorted.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className={`text-left rounded-2xl p-4 transition ${cardByStatus(
                        r.status
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold">
                          {formatRange(r.startHour, r.durationMin)}
                        </div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${courtPillClass(
                            r.courtId
                          )}`}
                        >
                          {courtLabel(r.courtId)}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-white/80">
                        <div className="font-semibold">{r.customerName}</div>
                        <div className="text-white/60">{r.customerPhone}</div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-white/60">
                          {r.status === "cancelled" ? "Cancelada" : "Confirmada"}
                        </span>

                        {r.status !== "cancelled" ? (
                          <span className="text-xs text-white/70">
                            Click para detalles →
                          </span>
                        ) : (
                          <span className="text-xs text-white/50">
                            Click para ver →
                          </span>
                        )}
                      </div>
                    </button>
                  ))}

                  {sorted.length === 0 ? (
                    <div className="col-span-full text-white/70 text-sm">
                      No hay reservas para esta fecha.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* MODAL */}
            <Modal
              open={!!selected}
              onClose={() => setSelected(null)}
              title={selected ? `Reserva ${selected.id}` : "Reserva"}
            >
              {selected ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${courtPillClass(
                        selected.courtId
                      )}`}
                    >
                      {courtLabel(selected.courtId)}
                    </span>
                    <span className="text-white/80 text-sm">
                      {selected.date} • {formatRange(selected.startHour, selected.durationMin)}
                    </span>
                    <span className="text-white/60 text-xs">
                      ({selected.durationMin} min)
                    </span>
                    <span className="ml-auto text-xs text-white/60">
                      Estado:{" "}
                      <span className="text-white">
                        {selected.status === "cancelled" ? "cancelled" : "confirmed"}
                      </span>
                    </span>
                  </div>

                  <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="text-sm text-white/60">Cliente</div>
                    <div className="mt-1 text-lg font-bold">{selected.customerName}</div>

                    <div className="mt-3 text-sm text-white/60">Teléfono</div>
                    <a
                      href={whatsappLink(selected.customerPhone)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 ring-1 ring-emerald-400/30 px-3 py-2"
                      onClick={(e) => e.stopPropagation()}
                      title="Abrir WhatsApp"
                    >
                      <span className="text-lg">💬</span>
                      <span className="font-semibold">{selected.customerPhone}</span>
                      <span className="text-xs text-white/70">(WhatsApp)</span>
                    </a>

                    <div className="mt-3 text-sm text-white/60">Notas</div>
                    <div className="mt-1 text-white/90 whitespace-pre-wrap">
                      {selected.notes?.trim() ? selected.notes : "—"}
                    </div>

                    <div className="mt-3 text-xs text-white/60">
                      Fuente: <span className="text-white">{selected.source || "web"}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {selected.status !== "cancelled" ? (
                      <button
                        onClick={() => cancelReservation(selected)}
                        disabled={cancelBusyId === selected.id}
                        className="rounded-xl bg-rose-500/80 hover:bg-rose-500 px-4 py-2 font-semibold disabled:opacity-60"
                      >
                        {cancelBusyId === selected.id ? "Cancelando..." : "Cancelar turno"}
                      </button>
                    ) : (
                      <div className="text-sm text-white/60">Esta reserva ya está cancelada.</div>
                    )}
                  </div>
                </div>
              ) : null}
            </Modal>
          </>
        )}
      </div>
    </div>
  );
}