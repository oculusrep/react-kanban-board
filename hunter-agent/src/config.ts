import dotenv from 'dotenv';
import path from 'path';

// Load from root .env file (parent directory)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  // Database
  supabase: {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  // LLM
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: 'gemini-2.5-flash',
    apiBase: 'https://generativelanguage.googleapis.com/v1beta',
  },

  // Transcription
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },

  // Email - Briefings
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.RESEND_FROM_EMAIL || 'hunter@oculusrep.com',
    toEmail: process.env.BRIEFING_TO_EMAIL || '',
  },

  // Gmail
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  // Source Credentials
  sources: {
    nrn: {
      username: process.env.NRN_USERNAME || '',
      password: process.env.NRN_PASSWORD || '',
    },
    qsr: {
      username: process.env.QSR_USERNAME || '',
      password: process.env.QSR_PASSWORD || '',
    },
    bizjournals: {
      username: process.env.BIZJOURNALS_USERNAME || '',
      password: process.env.BIZJOURNALS_PASSWORD || '',
    },
    icsc: {
      username: process.env.ICSC_USERNAME || '',
      password: process.env.ICSC_PASSWORD || '',
    },
  },

  // App Config
  app: {
    ovisUrl: process.env.OVIS_URL || 'http://localhost:5173',
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  // Lead Scoring - Geographic priorities
  scoring: {
    hotMarkets: [
      'georgia', 'ga', 'atlanta', 'savannah', 'augusta',
      'alabama', 'al', 'birmingham', 'huntsville',
      'tennessee', 'tn', 'nashville', 'memphis', 'knoxville',
      'south carolina', 'sc', 'charleston', 'greenville', 'columbia',
      'north carolina', 'nc', 'charlotte', 'raleigh', 'durham',
      'florida', 'fl', 'tampa', 'orlando', 'jacksonville', 'miami'
    ],
    warmPlusMarkets: [
      'texas', 'tx', 'dallas', 'austin', 'houston', 'san antonio',
      'ohio', 'oh', 'columbus', 'cleveland', 'cincinnati',
      'illinois', 'il', 'chicago'
    ],
    regionalTerms: ['southeast', 'sunbelt', 'southern', 'south'],
  },
} as const;

// Validate required config
export function validateConfig(): void {
  const required = [
    ['SUPABASE_URL', config.supabase.url],
    ['SUPABASE_SERVICE_KEY', config.supabase.serviceKey],
    ['GEMINI_API_KEY', config.gemini.apiKey],
  ];

  const missing = required.filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.map(([name]) => name).join(', ')}`
    );
  }
}

export default config;
