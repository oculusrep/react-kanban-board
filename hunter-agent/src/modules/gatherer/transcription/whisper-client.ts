import OpenAI from 'openai';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { config } from '../../../config';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('whisper-client');

export class WhisperClient {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }

  /**
   * Download audio file and transcribe with Whisper
   */
  async transcribeEpisode(audioUrl: string, episodeId: string): Promise<string | null> {
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `hunter-${episodeId}.mp3`);

    try {
      logger.info(`Downloading audio: ${audioUrl.substring(0, 80)}...`);

      // Download audio file
      const response = await axios({
        method: 'GET',
        url: audioUrl,
        responseType: 'stream',
        timeout: 300000, // 5 minute timeout for large files
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HunterBot/1.0)',
        },
      });

      // Write to temp file
      const writer = fs.createWriteStream(tempPath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Check file size - Whisper has a 25MB limit
      const stats = fs.statSync(tempPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      logger.info(`Downloaded ${fileSizeMB.toFixed(2)} MB`);

      if (fileSizeMB > 25) {
        logger.warn(`Audio file too large (${fileSizeMB.toFixed(2)}MB > 25MB limit), skipping transcription`);
        fs.unlinkSync(tempPath);
        return null;
      }

      // Transcribe with Whisper
      logger.info('Transcribing with Whisper API...');
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-1',
        response_format: 'text',
      });

      logger.info(`Transcription complete: ${transcription.length} characters`);

      // Cleanup
      fs.unlinkSync(tempPath);

      return transcription;
    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Transcription failed for ${episodeId}: ${message}`);
      return null;
    }
  }

  /**
   * Check if episode should be transcribed based on metadata
   */
  shouldTranscribe(title: string, description: string): boolean {
    // Keywords that suggest expansion/growth content
    const expansionKeywords = [
      'expansion',
      'expanding',
      'growth',
      'growing',
      'new location',
      'new locations',
      'franchise',
      'franchising',
      'franchisee',
      'southeast',
      'atlanta',
      'georgia',
      'texas',
      'florida',
      'real estate',
      'site selection',
      'development',
      'developer',
      'opening',
      'unit growth',
      'multi-unit',
      'territory',
      'scale',
      'scaling',
      'funding',
      'investment',
      'raise',
      'capital',
    ];

    const text = `${title} ${description}`.toLowerCase();

    return expansionKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Estimate transcription cost for an episode
   * Whisper pricing: $0.006 per minute
   */
  estimateCost(durationSeconds: number): number {
    const minutes = durationSeconds / 60;
    return minutes * 0.006;
  }

  /**
   * Parse duration string to seconds
   * Handles formats like "1:23:45" or "45:30" or "2700"
   */
  parseDuration(duration: string | null): number {
    if (!duration) return 0;

    // Already in seconds
    if (/^\d+$/.test(duration)) {
      return parseInt(duration, 10);
    }

    // HH:MM:SS or MM:SS format
    const parts = duration.split(':').map((p) => parseInt(p, 10));

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }

    return 0;
  }
}

export default WhisperClient;
