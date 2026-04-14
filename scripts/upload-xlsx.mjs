// Sube CM_Territorios_Guia.xlsx a la raíz de Shared Documents en el sitio Office.
// Uso: node scripts/upload-xlsx.mjs <ruta-local-al-xlsx>

import { readFile } from "node:fs/promises";

const TENANT = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const SITE_HOST = "citymoonlight.sharepoint.com";
const SITE_PATH = "/sites/Office";
const REMOTE_FILENAME = "CM_Territorios_Guia.xlsx";

const localPath = process.argv[2];
if (!localPath) {
  console.error("Falta ruta local. Uso: node scripts/upload-xlsx.mjs <path>");
  process.exit(1);
}

async function getToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  if (!res.ok) throw new Error(`Token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function main() {
  console.log("1) Token...");
  const token = await getToken();

  console.log(`2) Site ID (${SITE_HOST}${SITE_PATH})...`);
  const siteRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${SITE_HOST}:${SITE_PATH}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!siteRes.ok) throw new Error(`Site: ${siteRes.status} ${await siteRes.text()}`);
  const site = await siteRes.json();
  console.log(`   site.id = ${site.id}`);

  console.log(`3) Subiendo ${localPath} → /${REMOTE_FILENAME}...`);
  const fileBytes = await readFile(localPath);
  const uploadRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root:/${REMOTE_FILENAME}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      body: fileBytes,
    }
  );
  if (!uploadRes.ok) {
    throw new Error(`Upload: ${uploadRes.status} ${await uploadRes.text()}`);
  }
  const uploaded = await uploadRes.json();
  console.log(`   ✓ Subido. item.id = ${uploaded.id}`);
  console.log(`   webUrl: ${uploaded.webUrl}`);

  console.log(`\nEnv vars para Vercel:`);
  console.log(`  SHAREPOINT_SITE_ID=${site.id}`);
  console.log(`  SHAREPOINT_REPS_FILE=${REMOTE_FILENAME}`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
