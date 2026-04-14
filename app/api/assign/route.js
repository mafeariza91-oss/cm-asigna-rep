import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const REPS_FILE_PATH = (
  process.env.SHAREPOINT_FILE_PATH ||
  "Office Documents/Territorios/CM_Territorios_Guia_v2.xlsx"
).replace(/^Shared Documents\//i, "");
const REPS_SHEET = "Perfiles_Reps";

const RULES_AND_FORMAT = `REGLAS:
- Brooklyn → Terdiman (primario), Gattinella (overflow)
- Long Island → Garay
- Hoboken/Jersey City/Newark → Calderon
- Bronx → Perez (primario), Spaleta (alternativo)
- Queens (Astoria/JH/Corona/Flushing) → Spaleta
- Albany/Saratoga/Hudson Valley/Upstate → Hautzig (exclusivo)
- Manhattan Upper/Harlem → Perez
- Manhattan Midtown/Downtown → Miranti (con cuidado)
- NJ Central (Morristown/Union/NB) → Westenberger
- NJ Sur (Toms River/Lakewood/Trenton) → Rozinsky (solo zona sin cobertura)
- Westchester → sin cobertura activa
- Staten Island → evaluar caso por caso

Responde SOLO con JSON array sin markdown. Cada item:
{
  "account": "nombre",
  "address": "dirección",
  "zona": "zona identificada",
  "rep_primario": "Apellido, Nombre",
  "rep_alternativo": "Apellido, Nombre o null",
  "disponible": true/false,
  "confianza": "Alta|Media|Baja",
  "razonamiento": "1-2 oraciones en español"
}`;

let cachedToken = null;
let tokenExpiresAt = 0;
let cachedReps = null;
let repsCachedAt = 0;
const REPS_CACHE_MS = 5 * 60 * 1000;

async function getGraphToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const body = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID,
    client_secret: process.env.AZURE_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  if (!res.ok) throw new Error(`Azure token ${res.status}: ${await res.text()}`);

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function fetchRepsFromSharePoint() {
  if (cachedReps && Date.now() - repsCachedAt < REPS_CACHE_MS) return cachedReps;

  const token = await getGraphToken();
  const siteId = process.env.SHAREPOINT_SITE_ID;

  const encodedPath = REPS_FILE_PATH.split("/").map(encodeURIComponent).join("/");
  const itemRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!itemRes.ok) {
    throw new Error(`Buscar ${REPS_FILE_PATH}: ${itemRes.status} ${await itemRes.text()}`);
  }
  const item = await itemRes.json();

  const rangeRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${item.id}/workbook/worksheets('${REPS_SHEET}')/usedRange?$select=values`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!rangeRes.ok) {
    throw new Error(`Leer hoja ${REPS_SHEET}: ${rangeRes.status} ${await rangeRes.text()}`);
  }
  const range = await rangeRes.json();
  const values = range.values || [];
  if (values.length < 2) return [];

  const headers = values[0].map((h) => String(h || "").trim());
  const reps = values.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });

  cachedReps = reps;
  repsCachedAt = Date.now();
  return reps;
}

function normalizeBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v || "").trim().toLowerCase();
  return s === "true" || s === "sí" || s === "si" || s === "yes" || s === "1" || s === "x";
}

function buildRepsSection(reps) {
  const activos = reps.filter((r) => normalizeBool(r.Activo));
  const reciben = activos.filter(
    (r) => r.AceptaCuentas === "Sí" || r.AceptaCuentas === "Si" || r.AceptaCuentas === "Con cuidado"
  );
  const noReciben = activos.filter((r) => r.AceptaCuentas === "No");

  let out = "REPS QUE SÍ RECIBEN CUENTAS:\n\n";
  for (const r of reciben) {
    const cuidado = r.AceptaCuentas === "Con cuidado" ? " ASIGNAR CON CUIDADO." : "";
    out += `- ${r.Nombre} — ${r.Tipo}. ${r.Territorio}. Zonas: ${r.Zonas}.${cuidado}\n`;
  }

  if (noReciben.length) {
    out += "\nREPS QUE NO RECIBEN CUENTAS NUEVAS:\n";
    out += noReciben.map((r) => r.Nombre).join(", ") + ".\n";
  }

  return out;
}

function buildSystemPrompt(reps) {
  const header = `Eres el sistema de asignación de cuentas de City Moonlight Wines & Spirits, distribuidor de vinos y licores en New York y New Jersey.\n\n`;
  return header + buildRepsSection(reps) + "\n" + RULES_AND_FORMAT;
}

export async function POST(req) {
  try {
    const { input } = await req.json();
    if (!input || typeof input !== "string") {
      return Response.json({ error: "input requerido" }, { status: 400 });
    }

    const reps = await fetchRepsFromSharePoint();
    const systemPrompt = buildSystemPrompt(reps);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: input }],
    });

    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) {
        return Response.json(
          { error: "Respuesta no-JSON del modelo", raw: text },
          { status: 502 }
        );
      }
      parsed = JSON.parse(match[0]);
    }

    return Response.json(parsed);
  } catch (err) {
    return Response.json(
      { error: err.message || "Error interno" },
      { status: 500 }
    );
  }
}
