import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../config';
import { createLogger } from './logger';

const logger = createLogger('gemini-client');

let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

/**
 * Get or initialize the Gemini client
 */
export function getGeminiClient(): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }
  return genAI;
}

/**
 * Get or initialize the Gemini model
 */
export function getGeminiModel(): GenerativeModel {
  if (!model) {
    const client = getGeminiClient();
    model = client.getGenerativeModel({ model: config.gemini.model });
  }
  return model;
}

/**
 * Generate content with Gemini, with retry logic
 */
export async function generateContent(
  prompt: string,
  options: {
    temperature?: number;
    maxRetries?: number;
    retryDelay?: number;
  } = {}
): Promise<string> {
  const { temperature = 0.7, maxRetries = 3, retryDelay = 1000 } = options;

  const geminiModel = getGeminiModel();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await geminiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: 4096,
        },
      });

      const response = result.response;
      const text = response.text();

      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      return text;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Gemini attempt ${attempt}/${maxRetries} failed: ${message}`);

      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
    }
  }

  throw new Error('Gemini generation failed after all retries');
}

/**
 * Generate structured JSON output from Gemini
 */
export async function generateJSON<T>(
  prompt: string,
  options: {
    temperature?: number;
    maxRetries?: number;
  } = {}
): Promise<T> {
  const response = await generateContent(prompt, { ...options, temperature: options.temperature ?? 0.3 });

  // Extract JSON from response (may be wrapped in markdown code blocks)
  let jsonStr = response;

  // Remove markdown code blocks if present
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr) as T;
  } catch (parseError) {
    logger.error('Failed to parse Gemini JSON response', { response: response.substring(0, 500) });
    throw new Error(`Failed to parse JSON from Gemini response: ${parseError}`);
  }
}

export default {
  getGeminiClient,
  getGeminiModel,
  generateContent,
  generateJSON,
};
