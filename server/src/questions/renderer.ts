import { createCanvas, type CanvasRenderingContext2D } from 'canvas';

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Draw random background patterns: dots, lines, and subtle textures.
 */
function drawBackgroundNoise(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  // Fill background with off-white
  ctx.fillStyle = `rgb(${randomInt(240, 250)}, ${randomInt(240, 250)}, ${randomInt(240, 250)})`;
  ctx.fillRect(0, 0, width, height);

  // Random dots
  const dotCount = randomInt(80, 150);
  for (let i = 0; i < dotCount; i++) {
    const x = randomFloat(0, width);
    const y = randomFloat(0, height);
    const radius = randomFloat(0.5, 2.5);
    const alpha = randomFloat(0.05, 0.2);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${randomInt(100, 180)}, ${randomInt(100, 180)}, ${randomInt(100, 180)}, ${alpha})`;
    ctx.fill();
  }

  // Random thin lines
  const lineCount = randomInt(5, 15);
  for (let i = 0; i < lineCount; i++) {
    ctx.beginPath();
    ctx.moveTo(randomFloat(0, width), randomFloat(0, height));
    ctx.lineTo(randomFloat(0, width), randomFloat(0, height));
    ctx.strokeStyle = `rgba(${randomInt(120, 200)}, ${randomInt(120, 200)}, ${randomInt(120, 200)}, ${randomFloat(0.03, 0.12)})`;
    ctx.lineWidth = randomFloat(0.5, 1.5);
    ctx.stroke();
  }
}

/**
 * Draw noise overlay on top of the rendered text.
 */
function drawNoiseOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  // Scatter random small dots
  const dotCount = randomInt(40, 100);
  for (let i = 0; i < dotCount; i++) {
    const x = randomFloat(0, width);
    const y = randomFloat(0, height);
    const radius = randomFloat(0.3, 1.8);
    const alpha = randomFloat(0.05, 0.15);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${randomInt(50, 150)}, ${randomInt(50, 150)}, ${randomInt(50, 150)}, ${alpha})`;
    ctx.fill();
  }

  // A few short line segments
  const segCount = randomInt(3, 8);
  for (let i = 0; i < segCount; i++) {
    const x1 = randomFloat(0, width);
    const y1 = randomFloat(0, height);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + randomFloat(-30, 30), y1 + randomFloat(-15, 15));
    ctx.strokeStyle = `rgba(${randomInt(80, 160)}, ${randomInt(80, 160)}, ${randomInt(80, 160)}, ${randomFloat(0.04, 0.1)})`;
    ctx.lineWidth = randomFloat(0.5, 1.2);
    ctx.stroke();
  }
}

/**
 * Render text onto a canvas with slight rotation/warping and noise.
 */
function renderToDataUrl(
  text: string,
  width: number,
  height: number,
  fontSize?: number,
): string {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background noise
  drawBackgroundNoise(ctx, width, height);

  // Determine font size
  const size = fontSize ?? Math.min(Math.floor(height * 0.4), 64);
  const fontVariation = randomInt(-2, 2);
  const actualSize = size + fontVariation;

  ctx.font = `bold ${actualSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Apply slight rotation
  const angle = randomFloat(-3, 3) * (Math.PI / 180);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(angle);

  // Slight position jitter
  const jitterX = randomFloat(-3, 3);
  const jitterY = randomFloat(-3, 3);

  // Draw text shadow for depth
  ctx.fillStyle = `rgba(0, 0, 0, 0.08)`;
  ctx.fillText(text, jitterX + 2, jitterY + 2);

  // Draw main text
  ctx.fillStyle = `rgb(${randomInt(10, 40)}, ${randomInt(10, 40)}, ${randomInt(10, 40)})`;
  ctx.fillText(text, jitterX, jitterY);

  ctx.restore();

  // Noise overlay on top
  drawNoiseOverlay(ctx, width, height);

  const buffer = canvas.toBuffer('image/png');
  const base64 = buffer.toString('base64');
  return `data:image/png;base64,${base64}`;
}

/**
 * Render a math expression (e.g., "42 + 87") to a base64 PNG data URL.
 * Canvas size: 600x200.
 */
export function renderMathExpression(expression: string): string {
  return renderToDataUrl(expression, 600, 200);
}

/**
 * Render arbitrary question text to a base64 PNG data URL.
 */
export function renderQuestionImage(
  text: string,
  width: number = 600,
  height: number = 200,
): string {
  return renderToDataUrl(text, width, height);
}
