// Setup inicial: crea la lista "Reps_Territorios" en SharePoint y la popula.
// Ejecutar una sola vez: node scripts/seed-sharepoint.mjs

const TENANT = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const SITE_HOST = "citymoonlight.sharepoint.com";
const SITE_PATH = "/sites/Office";
const LIST_NAME = "Reps_Territorios";

const REPS = [
  { Nombre: "Garay, Anthony", Tipo: "Full-time", Territorio: "Long Island South Shore", Zonas: "Baldwin, Bay Shore, Amityville, Rockville Centre, Westbury, Franklin Square, Nassau/Suffolk County (96 cuentas)", AceptaCuentas: "Sí", Activo: true },
  { Nombre: "Terdiman, Irene", Tipo: "Full-time", Territorio: "Brooklyn", Zonas: "Brooklyn casi exclusivo (69 cuentas). Nueva. Prioridad para crecer.", AceptaCuentas: "Sí", Activo: true },
  { Nombre: "Miranti, Michael", Tipo: "Part-time", Territorio: "Manhattan", Zonas: "Midtown, UES, UWS, Chelsea, SoHo, Tribeca (66 cuentas). Solo cuentas selectas.", AceptaCuentas: "Con cuidado", Activo: true },
  { Nombre: "Perez, Gaudencio", Tipo: "Full-time", Territorio: "Manhattan Upper / Bronx", Zonas: "Harlem, Washington Heights, Inwood, El Bronx (66 cuentas). Fuerte en comunidades latinas.", AceptaCuentas: "Sí", Activo: true },
  { Nombre: "Gattinella, Mike", Tipo: "Part-time", Territorio: "Brooklyn + Manhattan", Zonas: "Brooklyn + algo Manhattan (32 cuentas). Con potencial.", AceptaCuentas: "Sí", Activo: true },
  { Nombre: "Spaleta, Domenik", Tipo: "Part-time", Territorio: "Queens + Bronx", Zonas: "Astoria, Jackson Heights, Corona, East Elmhurst, Flushing, Bronx (32 cuentas). Nuevo.", AceptaCuentas: "Sí", Activo: true },
  { Nombre: "Hautzig, David", Tipo: "Part-time", Territorio: "Upstate NY", Zonas: "Albany, Saratoga Springs, Hudson Valley, Catskills, Clifton Park (34 cuentas). Especialista único.", AceptaCuentas: "Sí", Activo: true },
  { Nombre: "Calderon, Scott", Tipo: "Full-time", Territorio: "NJ Norte / Hudson County", Zonas: "Hoboken, Jersey City, Newark, North Bergen, Cliffside Park (114 cuentas)", AceptaCuentas: "Sí", Activo: true },
  { Nombre: "Westenberger, Matt", Tipo: "Full-time", Territorio: "NJ Central / Morris County", Zonas: "Morristown, Union, New Brunswick, Kearny, Linden, Basking Ridge (140 cuentas)", AceptaCuentas: "Sí", Activo: true },
  { Nombre: "Rozinsky, Irina", Tipo: "Full-time", Territorio: "NJ Sur / Ocean County", Zonas: "Lakewood, Toms River, Hamilton, Trenton, East Brunswick (149 cuentas). Territorio muy grande — solo asignar si zona sin cobertura.", AceptaCuentas: "Con cuidado", Activo: true },
  { Nombre: "Angeroise, Michele", Tipo: "-", Territorio: "-", Zonas: "-", AceptaCuentas: "No", Activo: true },
  { Nombre: "Cittadino, Robert", Tipo: "-", Territorio: "-", Zonas: "-", AceptaCuentas: "No", Activo: true },
  { Nombre: "Forni, Tiziana", Tipo: "-", Territorio: "-", Zonas: "-", AceptaCuentas: "No", Activo: true },
  { Nombre: "Landeck, Howard", Tipo: "-", Territorio: "-", Zonas: "-", AceptaCuentas: "No", Activo: true },
  { Nombre: "Martin, David", Tipo: "-", Territorio: "-", Zonas: "-", AceptaCuentas: "No", Activo: true },
  { Nombre: "Webber, Chandler", Tipo: "-", Territorio: "-", Zonas: "-", AceptaCuentas: "No", Activo: true },
];

async function getToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function graph(token, path, init = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log("1) Obteniendo token Azure...");
  const token = await getToken();

  console.log(`2) Resolviendo site ID para ${SITE_HOST}${SITE_PATH}...`);
  const site = await graph(token, `/sites/${SITE_HOST}:${SITE_PATH}`);
  console.log(`   site.id = ${site.id}`);

  console.log(`3) Verificando si la lista "${LIST_NAME}" ya existe...`);
  const existing = await graph(token, `/sites/${site.id}/lists?$filter=displayName eq '${LIST_NAME}'`);
  let list;
  if (existing.value && existing.value.length > 0) {
    list = existing.value[0];
    console.log(`   Ya existe. list.id = ${list.id}`);
  } else {
    console.log("   No existe. Creando lista con columnas...");
    list = await graph(token, `/sites/${site.id}/lists`, {
      method: "POST",
      body: JSON.stringify({
        displayName: LIST_NAME,
        columns: [
          { name: "Nombre", text: {} },
          { name: "Tipo", text: {} },
          { name: "Territorio", text: {} },
          { name: "Zonas", text: { allowMultipleLines: true, textType: "plain" } },
          { name: "AceptaCuentas", text: {} },
          { name: "Activo", boolean: {} },
        ],
        list: { template: "genericList" },
      }),
    });
    console.log(`   list.id = ${list.id}`);
  }

  console.log(`4) Insertando ${REPS.length} reps...`);
  let ok = 0, fail = 0;
  for (const rep of REPS) {
    try {
      await graph(token, `/sites/${site.id}/lists/${list.id}/items`, {
        method: "POST",
        body: JSON.stringify({ fields: { Title: rep.Nombre, ...rep } }),
      });
      console.log(`   ✓ ${rep.Nombre}`);
      ok++;
    } catch (e) {
      console.log(`   ✗ ${rep.Nombre}: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n✅ Listo. ${ok} insertados, ${fail} errores.`);
  console.log(`\nCopia estos valores a Vercel:`);
  console.log(`  SHAREPOINT_SITE_ID=${site.id}`);
  console.log(`  SHAREPOINT_LIST_ID=${list.id}`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
