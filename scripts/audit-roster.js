const fs = require('node:fs')
const path = require('node:path')
const axios = require('axios')
const postgres = require('postgres')

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const [key, ...rest] = trimmed.split('=')
    if (!process.env[key]) process.env[key] = rest.join('=')
  }
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function names(rows, keys) {
  return rows
    .map((row) => keys.map((key) => row?.[key]).find(Boolean) || '')
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

function findMissing(expected, actualNames) {
  const actual = new Set(actualNames.map(normalize))
  return expected.filter((name) => !actual.has(normalize(name)))
}

async function getZohoToken() {
  if (!process.env.ZOHO_ACCESS_TOKEN_URL) return null
  const response = await axios.get(process.env.ZOHO_ACCESS_TOKEN_URL)
  let token = response.data?.access_token || response.data?.crmAPIResponse?.body?.access_token
  if (typeof token === 'string' && token.startsWith('Zoho-oauthtoken ')) {
    token = token.replace('Zoho-oauthtoken ', '')
  }
  return token || null
}

async function fetchZohoModule(token, moduleName, fields) {
  if (!token) return []
  const apiDomain = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com'
  const response = await axios.get(`${apiDomain}/crm/v2/${moduleName}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    params: { fields },
  })
  return response.data?.data || []
}

async function main() {
  loadEnv(path.join(process.cwd(), '.env'))
  loadEnv(path.join(process.cwd(), '.env.local'))

  const expectedPathArgIndex = process.argv.indexOf('--expected')
  const expectedPath = expectedPathArgIndex >= 0 ? process.argv[expectedPathArgIndex + 1] : ''
  const expected = expectedPath && fs.existsSync(expectedPath)
    ? JSON.parse(fs.readFileSync(expectedPath, 'utf8'))
    : { painters: [], foremen: [] }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for Supabase roster audit')
  }

  const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })
  const token = await getZohoToken()

  try {
    const [
      supabasePainters,
      supabaseForemen,
      zohoPainters,
      zohoForemen,
    ] = await Promise.all([
      sql`select id, name, email, phone, active from painters order by name`,
      sql`select id, zoho_id, name, email, phone from foremen order by name`,
      fetchZohoModule(token, process.env.ZOHO_PAINTERS_MODULE_NAME || 'Painters', 'id,Name,Email,Phone,Active'),
      fetchZohoModule(token, process.env.ZOHO_FOREMAN_MODULE_NAME || 'Foremans', 'id,Name,Email,Phone,Mobile'),
    ])

    const supabasePainterNames = names(supabasePainters, ['name'])
    const supabaseForemanNames = names(supabaseForemen, ['name'])
    const zohoPainterNames = names(zohoPainters, ['Name'])
    const zohoForemanNames = names(zohoForemen, ['Name', 'Email'])

    const report = {
      expectedInput: expectedPath ? path.resolve(expectedPath) : null,
      counts: {
        supabasePainters: supabasePainterNames.length,
        supabaseForemen: supabaseForemanNames.length,
        zohoPainters: zohoPainterNames.length,
        zohoForemen: zohoForemanNames.length,
      },
      current: {
        supabasePainters: supabasePainterNames,
        supabaseForemen: supabaseForemanNames,
        zohoPainters: zohoPainterNames,
        zohoForemen: zohoForemanNames,
      },
      missingFromExpected: {
        supabasePainters: findMissing(expected.painters || [], supabasePainterNames),
        zohoPainters: findMissing(expected.painters || [], zohoPainterNames),
        supabaseForemen: findMissing(expected.foremen || [], supabaseForemanNames),
        zohoForemen: findMissing(expected.foremen || [], zohoForemanNames),
      },
    }

    console.log(JSON.stringify(report, null, 2))
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error?.response?.data || error?.message || error)
  process.exit(1)
})
