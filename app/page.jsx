"use client";

import { useMemo, useState } from "react";

const REP_COLORS = {
  "Garay, Anthony": "#185FA5",
  "Terdiman, Irene": "#534AB7",
  "Miranti, Michael": "#0F6E56",
  "Perez, Gaudencio": "#993556",
  "Gattinella, Mike": "#534AB7",
  "Spaleta, Domenik": "#1D9E75",
  "Hautzig, David": "#BA7517",
  "Calderon, Scott": "#3B6D11",
  "Westenberger, Matt": "#3B6D11",
  "Rozinsky, Irina": "#993C1D",
};

const CONFIANZA_COLORS = {
  Alta: { bg: "#E6F5EC", fg: "#1D8A4A" },
  Media: { bg: "#FEF3DB", fg: "#B97C13" },
  Baja: { bg: "#FCE3E3", fg: "#B83232" },
};

const NAVY = "#1A2F4E";

const PLACEHOLDER = `Ejemplo (un registro por línea, formato "Nombre | Dirección"):

Liquor Barn | 123 Main St, Brooklyn, NY 11201
Wine Cellar NJ | 45 Washington St, Hoboken, NJ 07030
Uptown Spirits | 200 W 125th St, Harlem, NY 10027`;

export default function Page() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const lineCount = useMemo(
    () => input.split("\n").filter((l) => l.trim().length > 0).length,
    [input]
  );

  async function handleAssign() {
    setError(null);
    setResults(null);
    if (!input.trim()) {
      setError("Pega al menos una cuenta para asignar.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error en la asignación");
      } else if (!Array.isArray(data)) {
        setError("Respuesta inesperada del servidor.");
      } else {
        setResults(data);
      }
    } catch (e) {
      setError(e.message || "Error de red");
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setInput("");
    setResults(null);
    setError(null);
  }

  function handleExportCSV() {
    if (!results || !results.length) return;
    const headers = [
      "account",
      "address",
      "zona",
      "rep_primario",
      "rep_alternativo",
      "disponible",
      "confianza",
      "razonamiento",
      "cuenta_existente",
      "rep_actual",
      "es_premium",
      "escalar_a",
    ];
    const escape = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const rows = [headers.join(",")];
    for (const r of results) rows.push(headers.map((h) => escape(r[h])).join(","));
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asignaciones_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ maxWidth: 1024, margin: "0 auto", padding: "20px 16px 48px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div
          style={{
            width: 44,
            height: 44,
            background: NAVY,
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          CM
        </div>
        <h1 style={{ fontSize: 18, margin: 0, color: NAVY, lineHeight: 1.2 }}>
          Asignador de Reps · <span style={{ fontWeight: 500 }}>City Moonlight</span>
        </h1>
      </header>

      <section
        style={{
          background: "white",
          border: "1px solid #E1E4EA",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 1px 2px rgba(26,47,78,0.04)",
        }}
      >
        <label style={{ fontSize: 13, color: "#4A5669", fontWeight: 600, display: "block", marginBottom: 8 }}>
          Cuentas a asignar{lineCount > 0 ? ` (${lineCount})` : ""}
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={10}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: 12,
            border: "1px solid #D4D9E2",
            borderRadius: 8,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 13,
            lineHeight: 1.5,
            resize: "vertical",
            outline: "none",
          }}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <button
            onClick={handleAssign}
            disabled={loading}
            style={{
              background: NAVY,
              color: "white",
              border: "none",
              padding: "10px 18px",
              borderRadius: 8,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              fontSize: 14,
            }}
          >
            {loading ? "Asignando…" : "Asignar Reps →"}
          </button>
          <button
            onClick={handleClear}
            disabled={loading}
            style={{
              background: "white",
              color: NAVY,
              border: "1px solid #D4D9E2",
              padding: "10px 16px",
              borderRadius: 8,
              fontWeight: 500,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Limpiar
          </button>
          {results && results.length > 0 && (
            <button
              onClick={handleExportCSV}
              style={{
                background: "#0F6E56",
                color: "white",
                border: "none",
                padding: "10px 16px",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Exportar CSV
            </button>
          )}
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: "#FCE3E3",
              color: "#B83232",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </section>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20, color: NAVY }}>
          <span
            style={{
              width: 16,
              height: 16,
              border: `2px solid ${NAVY}`,
              borderTopColor: "transparent",
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span style={{ fontSize: 14 }}>Analizando {lineCount} cuenta{lineCount === 1 ? "" : "s"}…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {results && results.length > 0 && (
        <section style={{ marginTop: 24, display: "grid", gap: 12 }}>
          {results.map((r, i) => {
            const repColor = REP_COLORS[r.rep_primario] || "#4A5669";
            const conf = CONFIANZA_COLORS[r.confianza] || CONFIANZA_COLORS.Media;
            const repDisponible =
              r.rep_actual === "CM, Accounts Available" ||
              r.rep_actual === "Office, City Moonlight";
            const escalarA = Array.isArray(r.escalar_a) ? r.escalar_a : [];
            return (
              <article
                key={i}
                style={{
                  background: "white",
                  border: "1px solid #E1E4EA",
                  borderLeft: `4px solid ${repColor}`,
                  borderRadius: 10,
                  padding: 14,
                  boxShadow: "0 1px 2px rgba(26,47,78,0.04)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{r.account || "—"}</span>
                      {r.es_premium && (
                        <span
                          style={{
                            background: "linear-gradient(135deg, #D4A017, #B8860B)",
                            color: "white",
                            padding: "3px 9px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: 0.3,
                          }}
                        >
                          ⭐ ALTO POTENCIAL
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "#4A5669", marginTop: 2 }}>{r.address || "—"}</div>
                    <div style={{ fontSize: 12, color: "#6B7588", marginTop: 4 }}>Zona: <strong>{r.zona || "—"}</strong></div>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: conf.bg,
                      color: conf.fg,
                      alignSelf: "flex-start",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    {r.confianza || "—"}
                  </div>
                </div>

                {r.cuenta_existente && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "8px 10px",
                      background: repDisponible ? "#E6F5EC" : "#FEF3DB",
                      color: repDisponible ? "#1D8A4A" : "#8A5A00",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {repDisponible
                      ? `✓ Cuenta existente — Disponible para asignar (estaba en: ${r.rep_actual})`
                      : `⚠ Cuenta existente — Rep actual: ${r.rep_actual || "desconocido"}`}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <span
                    style={{
                      background: repColor,
                      color: "white",
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {r.rep_primario || "Sin asignar"}
                  </span>
                  {r.rep_alternativo && (
                    <span
                      style={{
                        background: "#EEF0F4",
                        color: "#4A5669",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      alt · {r.rep_alternativo}
                    </span>
                  )}
                  {r.disponible === false && (
                    <span
                      style={{
                        background: "#FCE3E3",
                        color: "#B83232",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      No disponible
                    </span>
                  )}
                </div>

                {escalarA.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                    {escalarA.includes("Diego") && (
                      <span
                        style={{
                          background: "#FEF3DB",
                          color: "#8A5A00",
                          padding: "4px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          border: "1px solid #E8C67A",
                        }}
                      >
                        🔺 Escalar a Diego (CEO) antes de asignar
                      </span>
                    )}
                    {escalarA.includes("Pablo") && (
                      <span
                        style={{
                          background: "#E8EEFB",
                          color: "#2A4A8A",
                          padding: "4px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          border: "1px solid #B8C8EA",
                        }}
                      >
                        📋 Pablo (Outbound) en el loop
                      </span>
                    )}
                  </div>
                )}

                {r.razonamiento && (
                  <p style={{ margin: "10px 0 0", fontSize: 13, color: "#4A5669", fontStyle: "italic" }}>
                    {r.razonamiento}
                  </p>
                )}
              </article>
            );
          })}
        </section>
      )}

      {results && results.length === 0 && (
        <div style={{ marginTop: 20, color: "#4A5669", fontSize: 14 }}>No se devolvieron asignaciones.</div>
      )}
    </div>
  );
}
