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
  durationMin: number;
  customerName: string;
  customerPhone: string;
  notes?: string;
  status?: "confirmed" | "cancelled";
  cancelledAt?: any;
  source?: "web" | "admin";
};

const VENUE_ID = "souler";

const COURTS: { id: CourtId; name: string; kind: "double" | "single" }[] = [
  { id: "c1", name: "Cancha 1 (Doble)", kind: "double" },
  { id: "c2", name: "Cancha 2 (Doble)", kind: "double" },
  { id: "c3", name: "Cancha 3 (Doble)", kind: "double" },
  { id: "c4", name: "Cancha 4 (Doble)", kind: "double" },
  { id: "s1", name: "Single (1 vs 1)", kind: "single" },
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayBA(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now); // YYYY-MM-DD
}

function nowBAParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(now)
    .reduce((acc: any, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  return {
    hh: Number(parts.hour),
    mm: Number(parts.minute),
    ss: Number(parts.second),
  };
}

function getScheduleForDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00-03:00`);
  const day = d.getDay();

  if (day >= 1 && day <= 5) return { openHour: 8, closeHour: 24 };
  if (day === 6) return { openHour: 8, closeHour: 21 };
  return { openHour: 16, closeHour: 22 };
}

function buildHours(openHour: number, closeHour: number) {
  const hours: number[] = [];
  for (let h = openHour; h < closeHour; h++) hours.push(h);
  return hours;
}

function isPastSlot(dateStr: string, hour: number) {
  const now = new Date();
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  if (dateStr !== dateFmt) return false;

  const { hh, mm } = nowBAParts();
  if (hour < hh) return true;
  if (hour === hh && mm > 0) return true;
  return false;
}

export default function AdminPage() {
  const [mounted, setMounted] = useState(false);

  const [token, setToken] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");

  // ⚠️ Importante: arrancan “vacíos” para evitar hydration mismatch
  const [date, setDate] = useState<string>("");
  const [includeCancelled, setIncludeCancelled] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [error, setError] = useState<string>("");

  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [createCourtId, setCreateCourtId] = useState<CourtId>("c1");
  const [createHour, setCreateHour] = useState<number>(8);
  const [createDuration, setCreateDuration] = useState<DurationMin>(60);
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [actionMsg, setActionMsg] = useState<string>("");

  // Reloj
  const [clock, setClock] = useState<{ hh: number; mm: number; ss: number } | null>(null);

  useEffect(() => {
    setMounted(true);

    // setear fecha y reloj en cliente (evita mismatch)
    setDate(todayBA());
    setClock(nowBAParts());

    const saved = localStorage.getItem("admin_token");
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const t = setInterval(() => setClock(nowBAParts()), 1000);
    return () => clearInterval(t);
  }, [mounted]);

  const schedule = useMemo(() => {
    if (!date) return { openHour: 8, closeHour: 24 };
    return getScheduleForDate(date);
  }, [date]);

  const hours = useMemo(() => buildHours(schedule.openHour, schedule.closeHour), [schedule]);

  const byCourtAndHour = useMemo(() => {
    const map = new Map<string, Reservation>();
    for (const r of reservations) {
      const status = r.status || "confirmed";
      if (status !== "confirmed") continue;
      const start = Number(r.startHour);
      const dur = Number(r.durationMin || 60);
      const slots = dur === 120 ? [start, start + 1] : [start];
      for (const h of slots) map.set(`${r.courtId}_${h}`, r);
    }
    return map;
  }, [reservations]);

  async function adminLogin() {
    setAuthError("");
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Login error (${res.status})`);
      const t = String(data?.token || "");
      if (!t) throw new Error("Token vacío");
      setToken(t);
      localStorage.setItem("admin_token", t);
      setPin("");
      setActionMsg("✅ Sesión iniciada");
    } catch (e: any) {
      setAuthError(e?.message || "Error de login");
    }
  }

  async function fetchReservations() {
    if (!token) {
      setError("Falta iniciar sesión (token).");
      return;
    }
    if (!date) return;

    setLoading(true);
    setError("");
    setActionMsg("");
    try {
      const url =
        `/api/admin/reservations?venueId=${encodeURIComponent(VENUE_ID)}` +
        `&date=${encodeURIComponent(date)}` +
        (includeCancelled ? "&includeCancelled=1" : "");

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`❌ No se pudo traer reservas (${res.status}). ${data?.error || ""}`.trim());
      setReservations(Array.isArray(data?.reservations) ? data.reservations : []);
    } catch (e: any) {
      setError(e?.message || "Error trayendo reservas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token && date) fetchReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, date, includeCancelled]);

  function openCreate(courtId: CourtId, hour: number) {
    setActionMsg("");
    setCreateCourtId(courtId);
    setCreateHour(hour);
    setCreateDuration(60);
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setCreateOpen(true);
  }

  async function createReservation() {
    setActionMsg("");
    try {
      if (!date) return;
      if (!customerName.trim() || !customerPhone.trim()) {
        setActionMsg("✖ Completá nombre y teléfono");
        return;
      }

      const res = await fetch("/api/reservations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: VENUE_ID,
          courtId: createCourtId,
          date,
          startHour: createHour,
          durationMin: createDuration,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          notes: notes.trim(),
          source: "admin",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Error creando (${res.status})`);
      setCreateOpen(false);
      setActionMsg("✅ Reserva creada");
      await fetchReservations();
    } catch (e: any) {
      setActionMsg(`✖ ${e?.message || "Error creando"}`);
    }
  }

  async function cancelReservation(reservation: Reservation) {
    setActionMsg("");
    try {
      if (!token) throw new Error("Missing Bearer token");
      if (!reservation?.id) throw new Error("Missing id");

      const res = await fetch("/api/admin/reservations/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: reservation.id, venueId: VENUE_ID }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Error cancelando (${res.status})`);
      setActionMsg("✅ Cancelada");
      await fetchReservations();
    } catch (e: any) {
      setActionMsg(`✖ ${e?.message || "Error cancelando"}`);
    }
  }

  function logout() {
    localStorage.removeItem("admin_token");
    setToken("");
    setReservations([]);
    setActionMsg("🔒 Sesión cerrada");
  }

  const clockText = clock ? `${pad2(clock.hh)}:${pad2(clock.mm)}:${pad2(clock.ss)}` : "--:--:--";

  return (
    <div className="min-h-screen text-white">
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950" />
      <div className="fixed inset-0 -z-10 opacity-30 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.35),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.10),transparent_35%),radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.20),transparent_45%)]" />

      <div className="mx-auto max-w-6xl px-4 py-6 md:py-10 space-y-4">
        {/* Header */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-4 shadow-lg">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-2xl bg-white/10 border border-white/10 grid place-items-center">
                <span className="text-xl">🎾</span>
              </div>
              <div>
                <div className="text-lg md:text-xl font-semibold tracking-tight">Souler · Panel administrador</div>
                <div className="text-xs md:text-sm text-white/70">
                  Hora BA: <span className="font-mono">{clockText}</span> · Turnos 60/120 · Lun-Vie 08–00 · Sáb 08–21 · Dom 16–22
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <span className="text-xs text-white/70">Fecha</span>
                <input
                  type="date"
                  value={date || ""}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent text-white outline-none text-sm"
                />
              </div>

              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeCancelled}
                  onChange={(e) => setIncludeCancelled(e.target.checked)}
                  className="accent-white"
                />
                <span className="text-sm text-white/80">Ver canceladas</span>
              </label>

              <button
                onClick={fetchReservations}
                className="rounded-xl px-4 py-2 border border-white/10 bg-white/10 hover:bg-white/15 transition text-sm"
              >
                ↻ Actualizar
              </button>

              {token ? (
                <button
                  onClick={logout}
                  className="rounded-xl px-4 py-2 border border-red-500/30 bg-red-500/10 hover:bg-red-500/15 transition text-sm"
                >
                  Salir
                </button>
              ) : null}
            </div>
          </div>

          {actionMsg ? <div className="mt-3 text-sm text-white/80">{actionMsg}</div> : null}
          {error ? <div className="mt-2 text-sm text-red-200">{error}</div> : null}
        </div>

        {/* Login */}
        {!token ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 shadow-lg max-w-md">
            <div className="text-lg font-semibold">Ingresar</div>
            <div className="text-sm text-white/70 mt-1">Ingresá tu PIN de administrador.</div>

            <div className="mt-4 flex gap-2">
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
                className="flex-1 rounded-xl bg-black/30 border border-white/10 px-3 py-2 outline-none text-white"
              />
              <button
                onClick={adminLogin}
                className="rounded-xl px-4 py-2 border border-white/10 bg-emerald-500/20 hover:bg-emerald-500/25 transition"
              >
                Entrar
              </button>
            </div>

            {authError ? <div className="mt-3 text-sm text-red-200">{authError}</div> : null}

            <div className="mt-4 text-xs text-white/60">
              Tip: el token se guarda en tu navegador para que no tengas que loguearte cada vez.
            </div>
          </div>
        ) : (
          <>
            {/* Leyenda */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1">
                <span className="h-3 w-3 rounded-full bg-emerald-400/80" /> Libre (doble)
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1">
                <span className="h-3 w-3 rounded-full bg-sky-400/80" /> Libre (single)
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1">
                <span className="h-3 w-3 rounded-full bg-white/40" /> Ocupado
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1">
                <span className="h-3 w-3 rounded-full bg-white/10" /> Pasado (bloqueado)
              </span>
              {loading ? <span className="ml-2">Cargando…</span> : null}
            </div>

            {/* Grilla */}
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur shadow-lg overflow-hidden">
              <div className="grid" style={{ gridTemplateColumns: `120px repeat(${COURTS.length}, minmax(0, 1fr))` }}>
                <div className="p-3 border-b border-white/10 bg-black/20">
                  <div className="text-xs text-white/70">Horario</div>
                </div>
                {COURTS.map((c) => (
                  <div key={c.id} className="p-3 border-b border-white/10 bg-black/20">
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="text-[11px] text-white/60">{c.kind === "double" ? "Doble" : "Single"}</div>
                  </div>
                ))}

                {hours.map((h) => {
                  const label = `${pad2(h)}:00`;
                  return (
                    <React.Fragment key={h}>
                      <div className="p-3 border-b border-white/10 bg-black/10">
                        <div className="font-mono text-sm">{label}</div>
                      </div>

                      {COURTS.map((c) => {
                        const key = `${c.id}_${h}`;
                        const r = byCourtAndHour.get(key);
                        const past = date ? isPastSlot(date, h) : false;

                        const freeBg =
                          c.kind === "double"
                            ? "bg-emerald-500/15 hover:bg-emerald-500/20"
                            : "bg-sky-500/15 hover:bg-sky-500/20";

                        if (r) {
                          return (
                            <div key={key} className="p-2 border-b border-white/10">
                              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold truncate">{r.customerName || "Reservado"}</div>
                                    <div className="text-xs text-white/70 truncate">
                                      {r.customerPhone || ""}
                                      {r.durationMin === 120 ? " · 120 min" : " · 60 min"}
                                    </div>
                                    {r.notes ? <div className="text-[11px] text-white/60 truncate">{r.notes}</div> : null}
                                  </div>

                                  <button
                                    onClick={() => cancelReservation(r)}
                                    className="shrink-0 rounded-lg px-2 py-1 text-xs border border-red-500/30 bg-red-500/10 hover:bg-red-500/15 transition"
                                    title="Cancelar"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={key} className="p-2 border-b border-white/10">
                            <button
                              disabled={past}
                              onClick={() => openCreate(c.id, h)}
                              className={[
                                "w-full rounded-xl border border-white/10 px-3 py-3 text-left transition",
                                past ? "bg-white/5 text-white/40 cursor-not-allowed" : freeBg,
                              ].join(" ")}
                              title={past ? "Horario ya pasó" : "Crear reserva"}
                            >
                              <div className="text-sm font-semibold">{past ? "No disponible" : "Disponible"}</div>
                              <div className="text-xs text-white/70">Tocar para reservar</div>
                            </button>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Modal Crear */}
            {createOpen ? (
              <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
                <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur p-5 shadow-2xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">Nueva reserva</div>
                      <div className="text-sm text-white/70">
                        {date} · {pad2(createHour)}:00 · {COURTS.find((x) => x.id === createCourtId)?.name}
                      </div>
                    </div>
                    <button
                      onClick={() => setCreateOpen(false)}
                      className="rounded-xl px-3 py-2 border border-white/10 bg-white/5 hover:bg-white/10 transition"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs text-white/70 mb-1">Duración</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setCreateDuration(60)}
                            className={[
                              "flex-1 rounded-xl px-3 py-2 border transition text-sm",
                              createDuration === 60 ? "border-white/20 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10",
                            ].join(" ")}
                          >
                            60 min
                          </button>
                          <button
                            onClick={() => setCreateDuration(120)}
                            className={[
                              "flex-1 rounded-xl px-3 py-2 border transition text-sm",
                              createDuration === 120 ? "border-white/20 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10",
                            ].join(" ")}
                          >
                            120 min
                          </button>
                        </div>
                        <div className="text-[11px] text-white/60 mt-2">Si no está disponible, el servidor lo rechaza automáticamente.</div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs text-white/70 mb-1">Datos</div>
                        <input
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Nombre y apellido"
                          className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 outline-none text-white mb-2"
                        />
                        <input
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="Teléfono"
                          className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 outline-none text-white"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="text-xs text-white/70 mb-1">Notas (opcional)</div>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ej: paga en mostrador, etc."
                        className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 outline-none text-white min-h-[80px]"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setCreateOpen(false)}
                        className="rounded-xl px-4 py-2 border border-white/10 bg-white/5 hover:bg-white/10 transition"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={createReservation}
                        className="rounded-xl px-4 py-2 border border-emerald-500/30 bg-emerald-500/20 hover:bg-emerald-500/25 transition"
                      >
                        Guardar
                      </button>
                    </div>

                    {actionMsg ? <div className="text-sm text-white/80">{actionMsg}</div> : null}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}