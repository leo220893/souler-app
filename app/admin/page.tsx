"use client";

import React, { useEffect, useMemo, useState } from "react";

type CourtId = "c1" | "c2" | "c3" | "c4" | "s1";
type DurationMin = 60 | 120;

type Reservation = {
  id: string;
  venueId: string;
  courtId: CourtId;
  date: string; // YYYY-MM-DD
  startHour: number;
  durationMin: DurationMin;
  customerName: string;
  customerPhone: string;
  notes?: string;
  status?: "confirmed" | "cancelled";
  source?: "web" | "admin";
  createdAt?: any;
  cancelledAt?: any;
};

const VENUE_ID = "souler";

const COURTS: Array<{
  id: CourtId;
  label: string;
  kind: "doble" | "single";
}> = [
  { id: "c1", label: "Cancha 1 (Doble)", kind: "doble" },
  { id: "c2", label: "Cancha 2 (Doble)", kind: "doble" },
  { id: "c3", label: "Cancha 3 (Doble)", kind: "doble" },
  { id: "c4", label: "Cancha 4 (Doble)", kind: "doble" },
  { id: "s1", label: "Cancha Single", kind: "single" },
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayBA(): string {
  // Fecha en America/Argentina/Buenos_Aires
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function getScheduleForDate(dateStr: string) {
  // 0=domingo ... 6=sábado. Forzamos -03:00 para evitar corrimientos.
  const d = new Date(`${dateStr}T00:00:00-03:00`);
  const day = d.getDay();

  // Lun a Vie: 08:00 a 00:00
  if (day >= 1 && day <= 5) return { openHour: 8, closeHour: 24 };

  // Sáb: 08:00 a 21:00
  if (day === 6) return { openHour: 8, closeHour: 21 };

  // Dom: 16:00 a 22:00
  return { openHour: 16, closeHour: 22 };
}

function buildHours(dateStr: string) {
  const { openHour, closeHour } = getScheduleForDate(dateStr);
  const hours: number[] = [];
  for (let h = openHour; h < closeHour; h++) hours.push(h);
  return hours;
}

function toWhatsAppLink(phoneRaw: string) {
  const digits = (phoneRaw || "").replace(/[^\d]/g, "");
  // Argentina: si ya viene con 54 o 549, lo dejamos.
  // Si viene local (ej: 1125073184), lo mandamos tal cual a wa.me (WhatsApp suele entenderlo).
  return `https://wa.me/${digits}`;
}

function classNames(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

export default function AdminPage() {
  const [pin, setPin] = useState("");
  const [token, setToken] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");

  const [date, setDate] = useState<string>(todayBA());
  const hours = useMemo(() => buildHours(date), [date]);

  const [loading, setLoading] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [fetchError, setFetchError] = useState<string>("");

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCourt, setModalCourt] = useState<CourtId | null>(null);
  const [modalHour, setModalHour] = useState<number | null>(null);

  // Crear desde modal (opcional)
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createDuration, setCreateDuration] = useState<DurationMin>(60);

  const [actionMsg, setActionMsg] = useState<string>("");

  // Persist token
  useEffect(() => {
    const t = localStorage.getItem("souler_admin_token") || "";
    if (t) setToken(t);
  }, []);

  useEffect(() => {
    if (token) localStorage.setItem("souler_admin_token", token);
  }, [token]);

  const reservationByCourtHour = useMemo(() => {
    // Elegimos la "mejor" reserva por slot: confirmed gana; si no, cancelled.
    const map = new Map<string, Reservation>();
    for (const r of reservations) {
      const key = `${r.courtId}_${r.startHour}`;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, r);
        continue;
      }
      const prevScore = prev.status === "confirmed" ? 2 : prev.status === "cancelled" ? 1 : 0;
      const curScore = r.status === "confirmed" ? 2 : r.status === "cancelled" ? 1 : 0;
      if (curScore > prevScore) map.set(key, r);
    }
    return map;
  }, [reservations]);

  async function login() {
    setAuthError("");
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data?.error || `Error (${res.status})`);
        return;
      }
      setToken(data.token);
    } catch (e: any) {
      setAuthError(e?.message || "Error de red");
    }
  }

  async function loadReservations() {
    setFetchError("");
    setActionMsg("");
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/reservations?venueId=${encodeURIComponent(VENUE_ID)}&date=${encodeURIComponent(
          date
        )}&includeCancelled=1`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setFetchError(`❌ No se pudo traer reservas (${res.status}). ${JSON.stringify(data)}`);
        setReservations([]);
        return;
      }

      setReservations((data.reservations || []) as Reservation[]);
    } catch (e: any) {
      setFetchError(`❌ Error de red: ${e?.message || "error"}`);
      setReservations([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, date]);

  function openSlot(courtId: CourtId, hour: number) {
    setActionMsg("");
    setModalCourt(courtId);
    setModalHour(hour);
    setIsModalOpen(true);

    // limpiar form "crear"
    setCreateName("");
    setCreatePhone("");
    setCreateNotes("");
    setCreateDuration(60);
  }

  function closeModal() {
    setIsModalOpen(false);
    setModalCourt(null);
    setModalHour(null);
  }

  const selectedReservation = useMemo(() => {
    if (!modalCourt || modalHour == null) return null;
    return reservationByCourtHour.get(`${modalCourt}_${modalHour}`) || null;
  }, [modalCourt, modalHour, reservationByCourtHour]);

  async function cancelReservation(resId: string) {
    setActionMsg("");
    if (!token) return setActionMsg("✖ Falta token admin");

    try {
      const res = await fetch("/api/admin/reservations/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ venueId: VENUE_ID, id: resId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionMsg(`✖ ${data?.error || `Error (${res.status})`}`);
        return;
      }

      setActionMsg("✅ Reserva cancelada");
      await loadReservations();
    } catch (e: any) {
      setActionMsg(`✖ ${e?.message || "Error de red"}`);
    }
  }

  async function createReservationFromModal() {
    setActionMsg("");
    if (!modalCourt || modalHour == null) return;

    const customerName = createName.trim();
    const customerPhone = createPhone.trim();
    if (!customerName || !customerPhone) {
      setActionMsg("✖ Completá nombre y teléfono");
      return;
    }

    try {
      const res = await fetch("/api/reservations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: VENUE_ID,
          courtId: modalCourt,
          date,
          startHour: modalHour,
          durationMin: createDuration, // podés dejar 60 fijo si querés
          customerName,
          customerPhone,
          notes: createNotes || "",
          source: "admin",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionMsg(`✖ ${data?.error || `Error (${res.status})`}`);
        return;
      }

      setActionMsg("✅ Reserva creada");
      await loadReservations();
    } catch (e: any) {
      setActionMsg(`✖ ${e?.message || "Error de red"}`);
    }
  }

  const headerGradient =
    "bg-gradient-to-r from-emerald-900 via-emerald-800 to-lime-800";
  const cardBg = "bg-black/40 backdrop-blur border border-white/10";
  const pageBg =
    "min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.25),transparent_55%),radial-gradient(circle_at_bottom,rgba(132,204,22,0.20),transparent_55%),linear-gradient(180deg,#0b1220, #050914)]";

  return (
    <div className={pageBg}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className={classNames("rounded-2xl p-5 shadow-xl", headerGradient)}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🎾</span>
                <h1 className="text-2xl font-extrabold tracking-tight text-white">
                  Souler — Panel Admin
                </h1>
              </div>
              <p className="text-white/80 text-sm">
                Tocá cualquier horario para ver detalles (y WhatsApp).
              </p>
            </div>

            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <div className={classNames("rounded-xl px-3 py-2", cardBg)}>
                <label className="text-xs text-white/70">Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-lime-300"
                />
              </div>

              <button
                onClick={() => loadReservations()}
                disabled={!token || loading}
                className="rounded-xl bg-white text-emerald-950 font-bold px-4 py-3 shadow hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Actualizando..." : "Actualizar agenda"}
              </button>
            </div>
          </div>
        </div>

        {/* Auth */}
        {!token && (
          <div className={classNames("mt-5 rounded-2xl p-5", cardBg)}>
            <h2 className="text-white font-bold text-lg">Ingresar</h2>
            <p className="text-white/70 text-sm">
              Ingresá el PIN para habilitar el panel.
            </p>

            <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className="text-xs text-white/70">PIN</label>
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-lime-300"
                  placeholder="Ej: 2505"
                />
              </div>
              <button
                onClick={login}
                className="rounded-xl bg-lime-400 text-emerald-950 font-extrabold px-5 py-3 shadow hover:brightness-95"
              >
                Entrar
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("souler_admin_token");
                  setToken("");
                  setPin("");
                }}
                className="rounded-xl bg-white/10 text-white font-semibold px-5 py-3 ring-1 ring-white/10 hover:bg-white/15"
              >
                Limpiar
              </button>
            </div>

            {authError && (
              <div className="mt-3 text-red-200 bg-red-500/20 ring-1 ring-red-400/30 rounded-xl px-3 py-2">
                {authError}
              </div>
            )}
          </div>
        )}

        {/* Errors */}
        {fetchError && (
          <div className="mt-5 text-red-200 bg-red-500/20 ring-1 ring-red-400/30 rounded-2xl px-4 py-3">
            {fetchError}
          </div>
        )}

        {/* Grid */}
        {token && (
          <div className="mt-5 rounded-2xl p-5 shadow-xl bg-white/5 ring-1 ring-white/10 backdrop-blur">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <h2 className="text-white font-extrabold text-lg">
                Canchas y horarios
              </h2>
              <div className="text-white/70 text-sm">
                Se muestran <b>todos</b> los horarios del día (disponibles u ocupados).
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <div className="min-w-[900px]">
                {/* Header row */}
                <div className="grid" style={{ gridTemplateColumns: `160px repeat(${hours.length}, minmax(60px, 1fr))` }}>
                  <div className="sticky left-0 z-10 rounded-l-xl bg-white/10 px-3 py-3 text-white/80 text-sm font-semibold ring-1 ring-white/10">
                    Canchas
                  </div>
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="bg-white/10 px-2 py-3 text-center text-white/70 text-xs font-semibold ring-1 ring-white/10"
                    >
                      {pad2(h)}:00
                    </div>
                  ))}
                </div>

                {/* Rows */}
                <div className="mt-2 space-y-2">
                  {COURTS.map((c) => {
                    const kindBadge =
                      c.kind === "doble"
                        ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30"
                        : "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/30";

                    return (
                      <div
                        key={c.id}
                        className="grid"
                        style={{ gridTemplateColumns: `160px repeat(${hours.length}, minmax(60px, 1fr))` }}
                      >
                        <div className={classNames("sticky left-0 z-10 rounded-xl px-3 py-3 text-white ring-1 ring-white/10", cardBg)}>
                          <div className="text-sm font-extrabold">{c.label}</div>
                          <div className={classNames("mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold", kindBadge)}>
                            {c.kind.toUpperCase()}
                          </div>
                        </div>

                        {hours.map((h) => {
                          const r = reservationByCourtHour.get(`${c.id}_${h}`);

                          const isConfirmed = r?.status === "confirmed";
                          const isCancelled = r?.status === "cancelled";

                          // Colores deportivos
                          const base =
                            c.kind === "doble"
                              ? "bg-emerald-400/10 hover:bg-emerald-400/15 ring-emerald-300/20"
                              : "bg-indigo-400/10 hover:bg-indigo-400/15 ring-indigo-300/20";

                          const occupied =
                            isConfirmed
                              ? "bg-red-500/25 hover:bg-red-500/30 ring-red-300/30"
                              : isCancelled
                              ? "bg-white/5 hover:bg-white/10 ring-white/10"
                              : base;

                          const text =
                            isConfirmed
                              ? "text-red-50"
                              : isCancelled
                              ? "text-white/60"
                              : "text-white/85";

                          return (
                            <button
                              key={h}
                              onClick={() => openSlot(c.id, h)}
                              className={classNames(
                                "ring-1 px-2 py-3 text-center text-xs font-bold transition rounded-lg",
                                occupied,
                                text
                              )}
                              title="Tocar para ver detalles"
                            >
                              {isConfirmed ? "OCUP." : isCancelled ? "CANC." : "LIBRE"}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-4 text-white/70 text-sm">
              Tip: “OCUP.” = confirmada, “CANC.” = cancelada, “LIBRE” = disponible.
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && modalCourt && modalHour != null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={closeModal}
          />
          <div className="relative w-full max-w-lg rounded-2xl bg-[#0b1220] ring-1 ring-white/10 shadow-2xl overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-emerald-900 via-emerald-800 to-lime-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-white/90 text-sm font-semibold">
                    {date} — {pad2(modalHour)}:00
                  </div>
                  <div className="text-white text-xl font-extrabold">
                    {COURTS.find((c) => c.id === modalCourt)?.label || modalCourt}
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  className="rounded-xl bg-black/30 text-white px-3 py-2 ring-1 ring-white/10 hover:bg-black/40"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-5">
              {selectedReservation && selectedReservation.status === "confirmed" ? (
                <>
                  <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="text-white font-extrabold text-lg">Reserva confirmada</div>
                    <div className="mt-2 text-white/85 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-white/60">Nombre</span>
                        <span className="font-semibold">{selectedReservation.customerName}</span>
                      </div>

                      <div className="flex justify-between gap-3 mt-1">
                        <span className="text-white/60">Teléfono</span>
                        <a
                          href={toWhatsAppLink(selectedReservation.customerPhone)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-extrabold text-lime-300 hover:underline"
                          title="Abrir WhatsApp"
                        >
                          {selectedReservation.customerPhone}
                        </a>
                      </div>

                      <div className="flex justify-between gap-3 mt-1">
                        <span className="text-white/60">Duración</span>
                        <span className="font-semibold">{selectedReservation.durationMin} min</span>
                      </div>

                      <div className="flex justify-between gap-3 mt-1">
                        <span className="text-white/60">Origen</span>
                        <span className="font-semibold">{selectedReservation.source || "-"}</span>
                      </div>

                      {selectedReservation.notes ? (
                        <div className="mt-3">
                          <div className="text-white/60 text-xs">Notas</div>
                          <div className="text-white/90 text-sm whitespace-pre-wrap">
                            {selectedReservation.notes}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col sm:flex-row gap-3">
                    <a
                      href={toWhatsAppLink(selectedReservation.customerPhone)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 rounded-xl bg-lime-400 text-emerald-950 font-extrabold px-4 py-3 text-center hover:brightness-95"
                    >
                      WhatsApp
                    </a>
                    <button
                      onClick={() => cancelReservation(selectedReservation.id)}
                      className="flex-1 rounded-xl bg-red-500/90 text-white font-extrabold px-4 py-3 hover:bg-red-500"
                    >
                      Cancelar turno
                    </button>
                  </div>
                </>
              ) : selectedReservation && selectedReservation.status === "cancelled" ? (
                <>
                  <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="text-white font-extrabold text-lg">Reserva cancelada</div>
                    <div className="mt-2 text-white/80 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-white/60">Nombre</span>
                        <span className="font-semibold">{selectedReservation.customerName}</span>
                      </div>
                      <div className="flex justify-between gap-3 mt-1">
                        <span className="text-white/60">Teléfono</span>
                        <a
                          href={toWhatsAppLink(selectedReservation.customerPhone)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-extrabold text-lime-300 hover:underline"
                          title="Abrir WhatsApp"
                        >
                          {selectedReservation.customerPhone}
                        </a>
                      </div>
                      <div className="flex justify-between gap-3 mt-1">
                        <span className="text-white/60">Duración</span>
                        <span className="font-semibold">{selectedReservation.durationMin} min</span>
                      </div>
                      {selectedReservation.notes ? (
                        <div className="mt-3">
                          <div className="text-white/60 text-xs">Notas</div>
                          <div className="text-white/90 text-sm whitespace-pre-wrap">
                            {selectedReservation.notes}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-white/70 text-sm">
                      Este horario está libre (la reserva está cancelada). Si querés, podés crear otra.
                    </div>
                  </div>

                  {/* Crear (opcional) */}
                  <div className="mt-4 rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="text-white font-extrabold">Crear nueva reserva</div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-white/60">Nombre</label>
                        <input
                          value={createName}
                          onChange={(e) => setCreateName(e.target.value)}
                          className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-lime-300"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-white/60">Teléfono</label>
                        <input
                          value={createPhone}
                          onChange={(e) => setCreatePhone(e.target.value)}
                          className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-lime-300"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs text-white/60">Notas</label>
                        <input
                          value={createNotes}
                          onChange={(e) => setCreateNotes(e.target.value)}
                          className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-lime-300"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-xs text-white/60">Duración</label>
                        <select
                          value={createDuration}
                          onChange={(e) => setCreateDuration(Number(e.target.value) as DurationMin)}
                          className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-lime-300"
                        >
                          <option value={60}>60 min</option>
                          <option value={120}>120 min</option>
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={createReservationFromModal}
                      className="mt-4 w-full rounded-xl bg-lime-400 text-emerald-950 font-extrabold px-4 py-3 hover:brightness-95"
                    >
                      Crear reserva
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="text-white font-extrabold text-lg">Disponible</div>
                    <div className="text-white/70 text-sm mt-1">
                      Este horario no tiene reserva confirmada.
                    </div>
                  </div>

                  {/* Crear (opcional) */}
                  <div className="mt-4 rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
                    <div className="text-white font-extrabold">Crear reserva</div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-white/60">Nombre</label>
                        <input
                          value={createName}
                          onChange={(e) => setCreateName(e.target.value)}
                          className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-lime-300"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-white/60">Teléfono</label>
                        <input
                          value={createPhone}
                          onChange={(e) => setCreatePhone(e.target.value)}
                          className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-lime-300"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs text-white/60">Notas</label>
                        <input
                          value={createNotes}
                          onChange={(e) => setCreateNotes(e.target.value)}
                          className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-lime-300"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-xs text-white/60">Duración</label>
                        <select
                          value={createDuration}
                          onChange={(e) => setCreateDuration(Number(e.target.value) as DurationMin)}
                          className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-lime-300"
                        >
                          <option value={60}>60 min</option>
                          <option value={120}>120 min</option>
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={createReservationFromModal}
                      className="mt-4 w-full rounded-xl bg-lime-400 text-emerald-950 font-extrabold px-4 py-3 hover:brightness-95"
                    >
                      Crear reserva
                    </button>
                  </div>
                </>
              )}

              {actionMsg && (
                <div className="mt-4 rounded-xl bg-white/5 ring-1 ring-white/10 px-4 py-3 text-white">
                  {actionMsg}
                </div>
              )}

              <div className="mt-5 text-white/50 text-xs">
                Tip: tocá el teléfono para abrir WhatsApp. (Si no abre, revisá que sea número con dígitos).
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}