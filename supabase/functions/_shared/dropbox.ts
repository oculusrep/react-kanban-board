// Shared Dropbox API utilities for Supabase Edge Functions
// Downloads files from Dropbox for use in other operations (e.g., QuickBooks attachments)

const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token'
const DROPBOX_CONTENT_URL = 'https://content.dropboxapi.com/2/files/download'

/**
 * Dropbox credentials configuration
 */
interface DropboxCredentials {
  accessToken: string
  refreshToken?: string
  appKey?: string
  appSecret?: string
}

/**
 * Get Dropbox credentials from environment variables
 */
export function getDropboxCredentials(): DropboxCredentials {
  const accessToken = Deno.env.get('DROPBOX_ACCESS_TOKEN')
  const refreshToken = Deno.env.get('DROPBOX_REFRESH_TOKEN')
  const appKey = Deno.env.get('DROPBOX_APP_KEY')
  const appSecret = Deno.env.get('DROPBOX_APP_SECRET')

  if (!accessToken) {
    throw new Error('DROPBOX_ACCESS_TOKEN not configured')
  }

  return {
    accessToken,
    refreshToken,
    appKey,
    appSecret
  }
}

/**
 * Refresh the Dropbox access token if we have the necessary credentials
 */
async function refreshAccessToken(credentials: DropboxCredentials): Promise<string> {
  if (!credentials.refreshToken || !credentials.appKey || !credentials.appSecret) {
    throw new Error('Cannot refresh Dropbox token: missing refresh_token, app_key, or app_secret')
  }

  console.log('Refreshing Dropbox access token...')

  const response = await fetch(DROPBOX_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: credentials.appKey,
      client_secret: credentials.appSecret,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to refresh Dropbox token: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log('Dropbox access token refreshed successfully')
  return data.access_token
}

/**
 * Download a file from Dropbox
 * @param path - Full path to the file in Dropbox (e.g., '/Salesforce Documents/Invoice Attachments/W9.pdf')
 * @returns The file content as Uint8Array
 */
export async function downloadFile(path: string): Promise<{ data: Uint8Array; name: string }> {
  const credentials = getDropboxCredentials()
  let accessToken = credentials.accessToken

  // Try to download with current token
  let response = await fetch(DROPBOX_CONTENT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path }),
    },
  })

  // If unauthorized, try to refresh the token
  if (response.status === 401 && credentials.refreshToken) {
    console.log('Dropbox token expired, attempting refresh...')
    accessToken = await refreshAccessToken(credentials)

    // Retry with new token
    response = await fetch(DROPBOX_CONTENT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path }),
      },
    })
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to download file from Dropbox: ${response.status} - ${errorText}`)
  }

  // Get file metadata from response header
  const apiResult = response.headers.get('Dropbox-API-Result')
  let fileName = path.split('/').pop() || 'file'

  if (apiResult) {
    try {
      const metadata = JSON.parse(apiResult)
      fileName = metadata.name || fileName
    } catch {
      // Use default filename if we can't parse metadata
    }
  }

  const data = new Uint8Array(await response.arrayBuffer())
  console.log(`Downloaded ${fileName} from Dropbox (${data.length} bytes)`)

  return { data, name: fileName }
}

/**
 * Download multiple files from Dropbox
 * @param paths - Array of full paths to files in Dropbox
 * @returns Array of file data with names
 */
export async function downloadFiles(
  paths: string[]
): Promise<Array<{ data: Uint8Array; name: string; path: string }>> {
  const results: Array<{ data: Uint8Array; name: string; path: string }> = []

  for (const path of paths) {
    try {
      const { data, name } = await downloadFile(path)
      results.push({ data, name, path })
    } catch (error) {
      console.error(`Failed to download ${path}:`, error)
      // Continue with other files - don't fail the whole batch
    }
  }

  return results
}

// Invoice attachment files configuration
// These files are attached to every new invoice in QuickBooks
export const INVOICE_ATTACHMENT_FOLDER = '/Salesforce Documents/Invoice Attachments'

export const INVOICE_ATTACHMENT_FILES = [
  'W9-Oculus REP - CURRENT.pdf',
  'OCULUS WIRING INSTRUCTIONS.PDF',
  'ACH_eCHECK INSTRUCTIONS.PDF'
]

/**
 * Get the full paths for standard invoice attachments
 */
export function getInvoiceAttachmentPaths(): string[] {
  return INVOICE_ATTACHMENT_FILES.map(fileName =>
    `${INVOICE_ATTACHMENT_FOLDER}/${fileName}`
  )
}

/**
 * Download all standard invoice attachment files from Dropbox
 * Returns the files that were successfully downloaded
 */
export async function downloadInvoiceAttachments(): Promise<Array<{ data: Uint8Array; name: string }>> {
  const paths = getInvoiceAttachmentPaths()
  console.log('Downloading invoice attachments from Dropbox:', paths)

  const results = await downloadFiles(paths)
  console.log(`Successfully downloaded ${results.length}/${paths.length} invoice attachments`)

  return results.map(({ data, name }) => ({ data, name }))
}

// ============================================================================
// WRITE PATH: server-side upload into a site submit's own folder.
//
// Until now this module was download-only. These functions let an edge function
// write a file (e.g. research CSVs) into /Salesforce Documents/Site Submits/... with
// the same folder naming, path guard and dropbox_mapping bookkeeping the browser
// uses (src/services/dropboxService.ts), so a folder created here is the same folder
// the Files tab shows.
// ============================================================================

const DROPBOX_API_URL = 'https://api.dropboxapi.com/2'
const DROPBOX_UPLOAD_URL = 'https://content.dropboxapi.com/2/files/upload'
export const DROPBOX_BASE_PATH = '/Salesforce Documents'

/**
 * Dropbox-API-Arg is an HTTP header, and headers must be ASCII. Dropbox requires
 * "HTTP header safe JSON": every UTF-16 code unit at or above 0x7F escaped as a JSON
 * unicode escape. A site submit named "Café Corner" would otherwise corrupt the header
 * and the upload would fail. Escaping per code unit keeps surrogate pairs valid JSON.
 * https://www.dropbox.com/developers/reference/json-encoding
 */
export function headerSafeJson(value: unknown): string {
  const json = JSON.stringify(value)
  let out = ''
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i)
    out += code >= 0x7f ? '\\u' + code.toString(16).padStart(4, '0') : json[i]
  }
  return out
}

/**
 * Server-side port of the browser's validatePath, made stricter. The browser checks
 * only startsWith('/Salesforce Documents'), which also admits '/Salesforce DocumentsX/...'.
 * Here the path must sit INSIDE the base folder, with no '.'/'..' or empty segments,
 * no backslashes or control characters. This copy is the real control: the browser's
 * runs where the caller controls the code.
 */
export function validateDropboxPath(path: string): void {
  if (typeof path !== 'string' || path.length === 0 || path.length > 1000) {
    throw new Error('Dropbox path rejected: empty or too long')
  }
  if (!path.startsWith(DROPBOX_BASE_PATH + '/')) {
    throw new Error(`Dropbox path rejected: must be inside ${DROPBOX_BASE_PATH}/`)
  }
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i)
    if (code < 0x20 || code === 0x7f || code === 0x5c /* backslash */) {
      throw new Error('Dropbox path rejected: control character or backslash')
    }
  }
  const segments = path.slice(1).split('/')
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new Error('Dropbox path rejected: empty, "." or ".." segment')
  }
}

/** Same cleaning as buildEntityFolderPath in src/services/dropboxService.ts; keep them identical. */
export function cleanFolderName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim()
}

/** Same as siteSubmitFolderName in src/services/dropboxService.ts; keep them identical. */
export function siteSubmitFolderName(name: string | null | undefined, id: string): string {
  const base = (name ?? '').trim() || 'Unnamed Site Submit'
  return `${base} - ${id.slice(0, 8)}`
}

export function siteSubmitFolderPath(name: string | null | undefined, id: string): string {
  return `${DROPBOX_BASE_PATH}/Site Submits/${cleanFolderName(siteSubmitFolderName(name, id))}`
}

/** One access token per invocation; refreshed once on 401, like downloadFile. */
let cachedAccessToken: string | null = null

async function dropboxRequest(
  url: string,
  init: { headers: Record<string, string>; body?: BodyInit },
): Promise<Response> {
  const credentials = getDropboxCredentials()
  const token = cachedAccessToken ?? credentials.accessToken
  const send = (t: string) =>
    fetch(url, { method: 'POST', headers: { ...init.headers, Authorization: `Bearer ${t}` }, body: init.body })

  let response = await send(token)
  if (response.status === 401 && credentials.refreshToken) {
    console.log('Dropbox token expired, attempting refresh...')
    cachedAccessToken = await refreshAccessToken(credentials)
    response = await send(cachedAccessToken)
  }
  return response
}

async function dropboxRpc(endpoint: string, args: unknown): Promise<Response> {
  return dropboxRequest(`${DROPBOX_API_URL}/${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
}

export async function dropboxFolderExists(path: string): Promise<boolean> {
  validateDropboxPath(path)
  const res = await dropboxRpc('files/get_metadata', { path })
  if (res.ok) {
    const meta = await res.json()
    return meta['.tag'] === 'folder'
  }
  const text = await res.text()
  if (res.status === 409 && text.includes('not_found')) return false
  throw new Error(`Dropbox get_metadata failed: ${res.status} - ${text}`)
}

/** Idempotent: an existing folder at the path counts as success. */
export async function dropboxCreateFolder(path: string): Promise<void> {
  validateDropboxPath(path)
  const res = await dropboxRpc('files/create_folder_v2', { path, autorename: false })
  if (res.ok) return
  const text = await res.text()
  if (res.status === 409 && text.includes('conflict')) {
    if (await dropboxFolderExists(path)) return
    throw new Error(`Dropbox create_folder conflict at ${path}, and it is not a folder`)
  }
  throw new Error(`Dropbox create_folder failed: ${res.status} - ${text}`)
}

export interface UploadResult {
  path: string
  size: number
  rev: string
}

/**
 * Upload bytes to an exact Dropbox path (single request; fine up to 150 MB).
 *
 * mode 'overwrite' replaces an existing file in place. Dropbox keeps the previous
 * version in the file's revision history, so a re-run is recoverable. mode 'add' never
 * replaces; with autorename it writes "name (1).csv".
 */
export async function uploadFile(
  path: string,
  data: Uint8Array,
  opts: { mode?: 'add' | 'overwrite'; autorename?: boolean } = {},
): Promise<UploadResult> {
  validateDropboxPath(path)
  const mode = opts.mode ?? 'add'
  const res = await dropboxRequest(DROPBOX_UPLOAD_URL, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': headerSafeJson({
        path,
        mode,
        autorename: opts.autorename ?? mode === 'add',
        mute: true,
        strict_conflict: false,
      }),
    },
    // Copy into a plain ArrayBuffer-backed view: BodyInit's typing rejects
    // Uint8Array<ArrayBufferLike> (it could be SharedArrayBuffer-backed).
    body: new Uint8Array(data).buffer as ArrayBuffer,
  })
  if (!res.ok) {
    throw new Error(`Dropbox upload failed for ${path}: ${res.status} - ${await res.text()}`)
  }
  const meta = await res.json()
  console.log(`Uploaded ${meta.path_display ?? path} (${meta.size} bytes)`)
  return { path: meta.path_display ?? path, size: meta.size, rev: meta.rev }
}

/**
 * The site submit's own folder: read from dropbox_mapping, or created and mapped.
 *
 * - Mapping exists and the folder exists: that path.
 * - Mapping exists but the folder was deleted in Dropbox: recreate at the mapped path.
 * - No mapping: create /Salesforce Documents/Site Submits/{name} - {id8} (creating the
 *   'Site Submits' parent if needed) and insert the mapping with the same sf_id
 *   placeholder the browser uses. A concurrent insert (unique violation) re-reads.
 *
 * `service` must be a service-role client: dropbox_mapping writes are internal-only
 * under RLS.
 */
// deno-lint-ignore no-explicit-any
export async function resolveSiteSubmitFolder(service: any, siteSubmitId: string): Promise<string> {
  const readMapping = async (): Promise<string | null> => {
    const { data, error } = await service
      .from('dropbox_mapping')
      .select('dropbox_folder_path')
      .eq('entity_type', 'site_submit')
      .eq('entity_id', siteSubmitId)
      .maybeSingle()
    if (error) throw new Error(`dropbox_mapping lookup failed: ${error.message}`)
    return data?.dropbox_folder_path ?? null
  }

  const mapped = await readMapping()
  if (mapped) {
    validateDropboxPath(mapped)
    if (!(await dropboxFolderExists(mapped))) await ensureFolderWithParent(mapped)
    return mapped
  }

  const { data: ss, error: ssErr } = await service
    .from('site_submit')
    .select('id, site_submit_name')
    .eq('id', siteSubmitId)
    .maybeSingle()
  if (ssErr) throw new Error(`site_submit lookup failed: ${ssErr.message}`)
  if (!ss) throw new Error(`site_submit ${siteSubmitId} not found`)

  const path = siteSubmitFolderPath(ss.site_submit_name, ss.id)
  await ensureFolderWithParent(path)

  const { error: insErr } = await service.from('dropbox_mapping').insert({
    entity_type: 'site_submit',
    entity_id: siteSubmitId,
    dropbox_folder_path: path,
    sf_id: `AUTO-${siteSubmitId.substring(0, 13)}`, // same placeholder as useDropboxFiles
    sfdb_file_found: false,
    last_verified_at: new Date().toISOString(),
  })
  if (insErr) {
    if (insErr.code === '23505') {
      const raced = await readMapping()
      if (raced) return raced
    }
    throw new Error(`dropbox_mapping insert failed: ${insErr.message}`)
  }
  return path
}

async function ensureFolderWithParent(path: string): Promise<void> {
  const parent = path.substring(0, path.lastIndexOf('/'))
  if (parent && parent !== DROPBOX_BASE_PATH && !(await dropboxFolderExists(parent))) {
    await dropboxCreateFolder(parent)
  }
  await dropboxCreateFolder(path)
}
