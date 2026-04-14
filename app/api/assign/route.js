import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `Eres el sistema de asignación de cuentas de City Moonlight Wines & Spirits, distribuidor de vinos y licores en New York y New Jersey.

REPS QUE SÍ RECIBEN CUENTAS:

NY:
- Garay, Anthony — Full-time. Long Island South Shore (Baldwin, Bay Shore, Amityville, Rockville Centre, Westbury, Franklin Square, Nassau/Suffolk County). 96 cuentas.
- Terdiman, Irene — Full-time. Nueva. Brooklyn (casi exclusivo). 69 cuentas. Prioridad para crecer.
- Miranti, Michael — Part-time. Manhattan (Midtown, UES, UWS, Chelsea, SoHo, Tribeca). 66 cuentas. ASIGNAR CON CUIDADO — solo cuentas selectas.
- Perez, Gaudencio — Manhattan Upper (Harlem, Washington Heights, Inwood), El Bronx. 66 cuentas. Fuerte en comunidades latinas.
- Gattinella, Mike — Part-time. Brooklyn + algo Manhattan. 32 cuentas. Con potencial.
- Spaleta, Domenik — Part-time. Nuevo. Queens (Astoria, Jackson Heights, Corona, East Elmhurst, Flushing) + Bronx. 32 cuentas.
- Hautzig, David — Part-time. Muy bueno. Upstate NY (Albany, Saratoga Springs, Hudson Valley, Catskills, Clifton Park). Especialista único. 34 cuentas.

NJ:
- Calderon, Scott — Full-time. NJ Norte / Hudson County (Hoboken, Jersey City, Newark, North Bergen, Cliffside Park). 114 cuentas.
- Westenberger, Matt — Full-time. NJ Central / Morris County (Morristown, Union, New Brunswick, Kearny, Linden, Basking Ridge). 140 cuentas.
- Rozinsky, Irina — NJ Sur / Ocean County (Lakewood, Toms River, Hamilton, Trenton, East Brunswick). 149 cuentas. TERRITORIO MUY GRANDE — solo asignar si zona sin cobertura.

REPS QUE NO RECIBEN CUENTAS NUEVAS:
Angeroise Michele, Cittadino Robert, Forni Tiziana, Landeck Howard, Martin David, Webber Chandler.

REGLAS:
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

export async function POST(req) {
  try {
    const { input } = await req.json();
    if (!input || typeof input !== "string") {
      return Response.json({ error: "input requerido" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: input }],
    });

    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) {
        return Response.json({ error: "Respuesta no-JSON del modelo", raw: text }, { status: 502 });
      }
      parsed = JSON.parse(match[0]);
    }

    return Response.json(parsed);
  } catch (err) {
    return Response.json({ error: err.message || "Error interno" }, { status: 500 });
  }
}
