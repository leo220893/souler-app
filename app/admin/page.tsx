"use client";

import { useEffect, useMemo, useState } from "react";

const VENUE_ID = "souler";
const TOKEN_KEY = "souler_admin_token";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function hhmmss(d: Date) {
  const H = String(d.getHours()).padStart(2, "0");
  const M = String(d.getMinutes()).padStart(2, "0");
  const S = String(d.getSeconds()).padStart(2, "0");
  return `${H}:${M}:${S}`;
}

function hh(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}

type Reservation = {
  id: string;
  venueId: string;
  courtId: string;
  date: string;
  startHour: number;
  durationMin: 60 | 120;
  customerName: string;
  customerPhone: string;
  notes?: string;
  status?: "confirmed" | "cancelled";
  source?: "web" | "admin";
  cancelledAt?: any;
};

function badgeStyle(status?: string) {
  if (status === "cancelled") return "bg-red-500/15 text-red-200 border-red-400/25";
  return "bg-emerald-500/15 text-emerald-200 border-emerald-400/25";
}

export default function AdminPage() {
  // ✅ reloj (FIX hydration)
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // auth
  const [pin, setPin] = useState("");
  const [token, setToken] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");

  // data
  const [date, setDate] = useState(todayISO());
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // cargar token guardado
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (saved) setToken(saved);
  }, []);

  const isLoggedIn = !!token;

  async function login() {
    setAuthError("");
    setMsg(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const j = await res.json();
      if (!res.ok) {
        setAuthError(j?.error || "No se pudo iniciar sesión");
        return;
      }

      const t = j?.token;
      if (!t) {
        setAuthError("No llegó token del servidor");
        return;
      }

      localStorage.setItem(TOKEN_KEY, t);
      setToken(t);
      setPin("");
      setMsg({ type: "ok", text: "✅ Sesión iniciada" });
    } catch (e: any) {
      setAuthError(e?.message || "Error de red");
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setReservations([]);
    setMsg({ type: "ok", text: "Sesión cerrada" });
  }

  async function fetchReservations() {
    if (!token) return;

    setLoading(true);
    setMsg(null);

    try {
      const url =
        `/api/admin/reservations?venueId=${encodeURIComponent(VENUE_ID)}&date=${encodeURIComponent(date)}` +
        (includeCancelled ? "&includeCancelled=1" : "");

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const j = await res.json();

      if (res.status === 401) {
        setMsg({ type: "err", text: `❌ No autorizado (401). Volvé a iniciar sesión.` });
        logout();
        return;
      }

      if (!res.ok) {
        setMsg({ type: "err", text: `❌ No se pudo traer reservas (${res.status}). ${j?.error || ""}` });
        return;
      }

      setReservations(Array.isArray(j?.reservations) ? j.reservations : []);
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message || "Error de red" });
    } finally {
      setLoading(false);
    }
  }

  async function cancelReservation(r: Reservation) {
    setMsg(null);

    if (!token) {
      setMsg({ type: "err", text: "Falta token. Volvé a iniciar sesión." });
      return;
    }

    if (!r?.id) {
      setMsg({ type: "err", text: "Missing id" });
      return;
    }

    try {
      const res = await fetch("/api/admin/reservations/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ venueId: VENUE_ID, id: r.id }),
      });

      const j = await res.json();

      if (res.status === 401) {
        setMsg({ type: "err", text: `❌ No autorizado (401). Volvé a iniciar sesión.` });
        logout();
        return;
      }

      if (!res.ok) {
        setMsg({ type: "err", text: `❌ No se pudo cancelar (${res.status}). ${j?.error || ""}` });
        return;
      }

      setMsg({ type: "ok", text: "✅ Turno cancelado" });
      await fetchReservations();
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message || "Error de red" });
    }
  }

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, date, includeCancelled]);

  const grouped = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of reservations) {
      const k = r.courtId || "sin-cancha";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    for (const [k, arr] of map) {
      arr.sort((a, b) => (a.startHour ?? 0) - (b.startHour ?? 0));
      map.set(k, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [reservations]);

  return (
    <main className="min-h-screen bg-[#070B0A] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-24 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-1/3 -left-24 h-[360px] w-[520px] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[520px] rounded-full bg-white/5 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.25) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-5xl px-5 py-8">
        <header className="mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Panel Administrador • Souler Padel
              </div>

              <h1 className="mt-3 text-4xl font-extrabold tracking-tight">
                <span className="text-white">Admin</span>{" "}
                <span className="text-white/60">— Gestión de turnos</span>
              </h1>

              <p className="mt-2 text-sm text-white/70">
                Ver, filtrar y cancelar reservas.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs text-white/60">Hora actual</div>
              <div className="font-mono text-2xl" suppressHydrationWarning>
                {now ? hhmmss(now) : "--:--:--"}
              </div>
              <div className="mt-1 text-[11px] text-white/60">Modo admin</div>
            </div>
          </div>
        </header>

        {!isLoggedIn ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 max-w-md">
            <h2 className="text-lg font-semibold">Ingresar</h2>
            <p className="mt-1 text-sm text-white/60">Ingresá el PIN de administrador.</p>

            <div className="mt-4 flex gap-2">
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
                type="password"
                className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400/40"
              />
              <button
                onClick={login}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 active:scale-[0.99]"
              >
                Entrar
              </button>
            </div>

            {authError ? (
              <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {authError}
              </div>
            ) : null}

            <div className="mt-4 text-xs text-white/50">
              Tip: el token se guarda en el navegador para que puedas usarlo desde el celular también.
            </div>
          </section>
        ) : (
          <>
            <section className="mb-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/60">Fecha</div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400/40"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/60">Filtros</div>
                <label className="mt-3 flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={includeCancelled}
                    onChange={(e) => setIncludeCancelled(e.target.checked)}
                    className="h-4 w-4 accent-emerald-400"
                  />
                  Mostrar canceladas
                </label>
                <div className="mt-2 text-[11px] text-white/55">
                  Si está apagado, muestra solo <b>confirmed</b>.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/60">Acciones</div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={fetchReservations}
                    className="flex-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm hover:bg-white/15 active:scale-[0.99]"
                  >
                    {loading ? "Actualizando..." : "Actualizar"}
                  </button>
                  <button
                    onClick={logout}
                    className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm hover:bg-white/5 active:scale-[0.99]"
                  >
                    Salir
                  </button>
                </div>
              </div>
            </section>

            {msg ? (
              <div
                className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
                  msg.type === "ok"
                    ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                    : "border-red-400/20 bg-red-500/10 text-red-200"
                }`}
              >
                {msg.text}
              </div>
            ) : null}

            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Reservas</h2>
                <div className="text-xs text-white/60">{reservations.length} turno(s)</div>
              </div>

              {reservations.length === 0 ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                  No hay reservas para esta fecha.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {grouped.map(([courtId, list]) => (
                    <div key={courtId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="font-semibold">
                          Cancha: <span className="text-white/80">{courtId}</span>
                        </div>
                        <div className="text-xs text-white/60">{list.length} turno(s)</div>
                      </div>

                      <div className="space-y-2">
                        {list.map((r) => (
                          <div
                            key={r.id}
                            className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3 md:flex-row md:items-center md:justify-between"
                          >
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-semibold">
                                  {hh(r.startHour)}{" "}
                                  <span className="text-white/60 font-normal">({r.durationMin} min)</span>
                                </div>

                                <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeStyle(r.status)}`}>
                                  {r.status || "confirmed"}
                                </span>

                                <span className="text-xs text-white/60">{r.source ? `• ${r.source}` : ""}</span>
                              </div>

                              <div className="mt-1 text-sm text-white/80">
                                {r.customerName} <span className="text-white/50">— {r.customerPhone}</span>
                              </div>

                              {r.notes ? (
                                <div className="mt-1 text-xs text-white/60">Nota: {r.notes}</div>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-2">
                              {r.status !== "cancelled" ? (
                                <button
                                  onClick={() => cancelReservation(r)}
                                  className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 active:scale-[0.99]"
                                >
                                  Cancelar
                                </button>
                              ) : (
                                <div className="text-xs text-white/50">Cancelada</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <footer className="mt-8 text-center text-xs text-white/50">Souler • Panel admin</footer>
          </>
        )}
      </div>
    </main>
  );
}