import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const REPS_FILE_PATH = (
  process.env.SHAREPOINT_FILE_PATH ||
  "Office Documents/Territorios/CM_Territorios_Guia_v2.xlsx"
).replace(/^Shared Documents\//i, "");
const REPS_SHEET = "Perfiles_Reps";
const CUENTAS_FILE_PATH = (
  process.env.SHAREPOINT_CUENTAS_PATH ||
  "Office Documents/Territorios/Cuentas Activas.csv"
).replace(/^Shared Documents\//i, "");

const REPS_DISPONIBLES = new Set([
  "CM, Accounts Available",
  "Office, City Moonlight",
]);

const PREMIUM_BRANDS = [
  "michelin", "relais", "châteaux", "chateaux", "forbes", "ritz", "four seasons",
  "cipriani", "nobu", "per se", "le bernardin", "daniel", "eleven madison",
  "chef's table", "atera", "masa", "jean-georges", "gramercy tavern", "the modern",
  "aquavit", "aska", "blue hill",
];
const PREMIUM_KEYWORDS = [
  "starred", "estrellas", "michelin star", "luxury", "private club",
  "country club", "private membership",
];

const RULES_AND_FORMAT = `REGLAS DE TERRITORIO:
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

DETECCIÓN DE CUENTAS PREMIUM (es_premium=true):
Marca true si el nombre de la cuenta contiene alguna de estas marcas: Michelin, Relais & Châteaux, Forbes, Ritz, Four Seasons, Cipriani, Nobu, Per Se, Le Bernardin, Daniel, Eleven Madison, Chef's Table, Atera, Masa, Jean-Georges, Gramercy Tavern, The Modern, Aquavit, Aska, Blue Hill. O contiene palabras clave: "starred", "estrellas", "Michelin star", "luxury", "private club", "country club", "private membership".
Si es premium → agregar "Diego" a escalar_a. Nota en razonamiento que requiere escalación al CEO.

CUENTAS ESTRATÉGICAS (cadenas, multi-local, volumen alto, corporativas):
Agregar "Pablo" a escalar_a (Outbound Sales Manager debe estar en el loop).

CUENTAS EXISTENTES:
Se te pasa en el contexto si una cuenta ya existe en el CRM y su rep actual:
- Si rep_actual = "CM, Accounts Available" o "Office, City Moonlight" → la cuenta está disponible para reasignar; procede como asignación normal (cuenta_existente=true, disponible=true).
- Si rep_actual es otro rep → NO reasignar. Devuelve disponible=false, rep_primario=rep_actual, razonamiento explicando que ya está asignada.
- Si la cuenta es nueva → cuenta_existente=false, rep_actual=null.

OUTPUT — Responde SOLO con JSON array sin markdown. Cada item:
{
  "account": "nombre",
  "address": "dirección",
  "zona": "zona identificada",
  "rep_primario": "Apellido, Nombre",
  "rep_alternativo": "Apellido, Nombre o null",
  "disponible": true/false,
  "confianza": "Alta|Media|Baja",
  "razonamiento": "1-2 oraciones en español",
  "cuenta_existente": true/false,
  "rep_actual": "Apellido, Nombre o null",
  "es_premium": true/false,
  "escalar_a": ["Diego"] | ["Pablo"] | ["Diego", "Pablo"] | []
}`;

let cachedToken = null;
let tokenExpiresAt = 0;
let cachedReps = null;
let repsCachedAt = 0;
let cachedCuentas = null;
let cuentasCachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

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

function encodePath(p) {
  return p.split("/").map(encodeURIComponent).join("/");
}

async function fetchRepsFromSharePoint() {
  if (cachedReps && Date.now() - repsCachedAt < CACHE_MS) return cachedReps;

  const token = await getGraphToken();
  const siteId = process.env.SHAREPOINT_SITE_ID;

  const itemRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodePath(REPS_FILE_PATH)}`,
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

function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0);
  if (!lines.length) return [];

  function parseLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else cur += c;
      } else {
        if (c === ",") { out.push(cur); cur = ""; }
        else if (c === '"' && cur === "") { inQuotes = true; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  const headers = parseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const vals = parseLine(l);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (vals[i] ?? "").trim();
    });
    return obj;
  });
}

async function fetchCuentasFromSharePoint() {
  if (cachedCuentas && Date.now() - cuentasCachedAt < CACHE_MS) return cachedCuentas;

  const token = await getGraphToken();
  const siteId = process.env.SHAREPOINT_SITE_ID;

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodePath(CUENTAS_FILE_PATH)}:/content`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    if (res.status === 404) {
      cachedCuentas = [];
      cuentasCachedAt = Date.now();
      return [];
    }
    throw new Error(`Buscar ${CUENTAS_FILE_PATH}: ${res.status} ${await res.text()}`);
  }
  const text = await res.text();
  const rows = parseCSV(text);

  const nameKeys = ["Account", "Account Legal Name", "Account Name", "Cuenta", "Customer", "Customer Name", "Nombre", "Name"];
  const repKeys = ["Territory Owner Rep", "Rep", "Sales Rep", "Representante", "Assigned", "Asignado"];
  if (!rows.length) return [];
  const sample = rows[0];
  const nameKey = nameKeys.find((k) => k in sample);
  const repKey = repKeys.find((k) => k in sample);

  const cuentas = rows.map((r) => ({
    nombre: nameKey ? String(r[nameKey] || "").trim() : "",
    rep: repKey ? String(r[repKey] || "").trim() : "",
  })).filter((c) => c.nombre);

  cachedCuentas = cuentas;
  cuentasCachedAt = Date.now();
  return cuentas;
}

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function lookupCuenta(inputName, cuentas) {
  const norm = normalizeName(inputName);
  if (!norm) return null;
  return cuentas.find((c) => normalizeName(c.nombre) === norm) || null;
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

function buildContextBlock(inputLines, cuentas) {
  const lines = inputLines.map((line) => {
    const [namePart] = line.split("|");
    const name = (namePart || "").trim();
    if (!name) return null;
    const match = lookupCuenta(name, cuentas);
    if (!match) return `- "${name}" → NO EXISTE (cuenta nueva)`;
    if (REPS_DISPONIBLES.has(match.rep)) {
      return `- "${name}" → EXISTE, rep_actual="${match.rep}" (DISPONIBLE para reasignar)`;
    }
    return `- "${name}" → EXISTE, rep_actual="${match.rep}" (YA ASIGNADA)`;
  }).filter(Boolean);

  if (!lines.length) return "";
  return `\n\nCONTEXTO DE CRM (estado actual de cada cuenta del input):\n${lines.join("\n")}`;
}

export async function POST(req) {
  try {
    const { input } = await req.json();
    if (!input || typeof input !== "string") {
      return Response.json({ error: "input requerido" }, { status: 400 });
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key || key.length < 50) {
      return Response.json(
        {
          error: "ANTHROPIC_API_KEY no disponible en runtime",
          diag: {
            present: !!key,
            length: key?.length ?? 0,
            prefix: key?.slice(0, 12) ?? null,
          },
        },
        { status: 500 }
      );
    }

    const [reps, cuentas] = await Promise.all([
      fetchRepsFromSharePoint(),
      fetchCuentasFromSharePoint(),
    ]);

    const systemPrompt = buildSystemPrompt(reps);
    const inputLines = input.split("\n").filter((l) => l.trim().length > 0);
    const contextBlock = buildContextBlock(inputLines, cuentas);
    const userMessage = input + contextBlock;

    const client = new Anthropic({ apiKey: key });

    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
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
