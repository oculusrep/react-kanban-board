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
