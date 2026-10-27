import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export interface ImageMenuText {
  lines: string[];
  confidence: number;
}

/** OCR runs locally with bundled Spanish data: no cloud/model API or URL fetch. */
const captures = new Map<string, Promise<ImageMenuText | null>>();
let activeRecognitions = 0;

export class MenuOcrBusyError extends Error {}

export function readMenuImage(body: Buffer): Promise<ImageMenuText | null> {
  const key = createHash('sha256').update(body).digest('hex');
  const existing = captures.get(key);
  if (existing) return existing;
  // The API and worker each allow only one OCR child at a time.
  if (activeRecognitions >= 1) return Promise.reject(new MenuOcrBusyError());
  if (captures.size >= 32) {
    const oldest = [...captures.keys()][0];
    if (oldest !== undefined) captures.delete(oldest);
  }
  activeRecognitions += 1;
  const pending = recognizeMenuImage(body).finally(() => {
    activeRecognitions -= 1;
  });
  captures.set(key, pending);
  return pending;
}

async function recognizeMenuImage(body: Buffer): Promise<ImageMenuText | null> {
  try {
    const metadata = await sharp(body, {
      limitInputPixels: 20_000_000,
    }).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 300)
      return null;
    const input = await sharp(body, { limitInputPixels: 20_000_000 })
      .resize({
        width: Math.max(1200, Math.min(metadata.width, 2400)),
        height: 10000,
        fit: 'inside',
      })
      .grayscale()
      .normalise()
      .png()
      .toBuffer();
    // A separate process gives the whole OCR worker tree a hard lifetime bound.
    const script = `
      const { createWorker } = require(${JSON.stringify(require.resolve('tesseract.js'))});
      const language = require(${JSON.stringify(require.resolve('@tesseract.js-data/spa'))});
      const chunks = [];
      process.stdin.on('data', chunk => chunks.push(chunk));
      process.stdin.on('end', async () => {
        let worker;
        try {
          worker = await createWorker('spa', 1, { langPath: language.langPath, gzip: true, cacheMethod: 'none' });
          const result = await worker.recognize(Buffer.concat(chunks), {}, { text: true, blocks: true });
          const lines = (result.data.blocks || []).flatMap(block => block.paragraphs || []).flatMap(paragraph => paragraph.lines || []);
          const safe = lines.filter(line => line.confidence >= 85 && (line.words || []).every(word => {
            if (!/\\d/.test(word.text)) return true;
            const digits = (word.symbols || []).filter(symbol => /\\d/.test(symbol.text));
            return word.confidence >= 95 || (word.confidence >= 90 && digits.length > 0 && digits.every(symbol => symbol.confidence >= 99));
          })).map(line => line.text.trim());
          process.stdout.write(JSON.stringify({ lines: safe, confidence: result.data.confidence }));
        } catch { process.exitCode = 1; }
        finally { if (worker) await worker.terminate(); }
      });`;
    return await new Promise<ImageMenuText | null>((resolve) => {
      const child = execFile(
        process.execPath,
        ['--max-old-space-size=256', '-e', script],
        { timeout: 45000, maxBuffer: 512_000, windowsHide: true },
        (error, stdout) => {
          if (error) return resolve(null);
          try {
            const result = JSON.parse(stdout) as ImageMenuText;
            resolve(
              result.confidence >= 85 && result.lines.length >= 6
                ? result
                : null,
            );
          } catch {
            resolve(null);
          }
        },
      );
      child.stdin?.on('error', () => {
        /* Timeout may close input first. */
      });
      child.stdin?.end(input);
    });
  } catch {
    return null;
  }
}
