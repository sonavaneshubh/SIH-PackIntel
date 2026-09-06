import {
  PackageDetectionResult,
  PackageDetectionService,
  ObjectCategory,
} from '@/types/scanner';

/**
 * Browser-side food package detector.
 *
 * This is an adapter implementing the `PackageDetectionService` interface from
 * `@/types/scanner`. Today it is backed by a lightweight, frame-based heuristic
 * that distinguishes packaged-food-like frames from empty scenes, people and
 * generic objects. It is intentionally conservative: it never reports a
 * `food_package` on a blank or featureless frame.
 *
 * The real classification is planned to run on the backend with a proper
 * object-detection model/API. When that ships, swap the adapter implementation
 * below for a call against that service while keeping the same interface — the
 * scanner state machine, camera UX and capture flow do not need to change.
 */

export const SCANNER_INNER_BOX = {
  left: 0.18,
  right: 0.82,
  top: 0.14,
  bottom: 0.86,
};

interface FrameMetrics {
  luminanceMean: number;
  luminanceVariance: number;
  edgeDensity: number;
  textEdgeDensity: number;
  foregroundRatio: number;
  colorfulness: number;
  skinToneRatio: number;
  centerX: number;
  centerY: number;
}

const ANALYSIS_WIDTH = 320;

function luminanceAt(pixels: Uint8ClampedArray, width: number, column: number, row: number): number {
  const offset = (row * width + column) * 4;
  return pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
}

function computeMetrics(video: HTMLVideoElement, canvas: HTMLCanvasElement): FrameMetrics | null {
  const analysisHeight = Math.max(180, Math.round(ANALYSIS_WIDTH * (video.videoHeight / video.videoWidth)));
  canvas.width = ANALYSIS_WIDTH;
  canvas.height = analysisHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(video, 0, 0, ANALYSIS_WIDTH, analysisHeight);
  const pixels = context.getImageData(0, 0, ANALYSIS_WIDTH, analysisHeight).data;

  const left = Math.round(ANALYSIS_WIDTH * SCANNER_INNER_BOX.left);
  const right = Math.round(ANALYSIS_WIDTH * SCANNER_INNER_BOX.right);
  const top = Math.round(analysisHeight * SCANNER_INNER_BOX.top);
  const bottom = Math.round(analysisHeight * SCANNER_INNER_BOX.bottom);

  let luminanceTotal = 0;
  let luminanceSquareTotal = 0;
  let edgeTotal = 0;
  let textEdges = 0;
  let foregroundCount = 0;
  let weightedX = 0;
  let weightedY = 0;
  let colorSpreadTotal = 0;
  let skinToneCount = 0;
  let sampledPixels = 0;

  for (let row = top + 1; row < bottom - 1; row += 2) {
    for (let column = left + 1; column < right - 1; column += 2) {
      const center = luminanceAt(pixels, ANALYSIS_WIDTH, column, row);
      const horizontalEdge = Math.abs(center - luminanceAt(pixels, ANALYSIS_WIDTH, column - 1, row));
      const verticalEdge = Math.abs(center - luminanceAt(pixels, ANALYSIS_WIDTH, column, row - 1));
      const edgeStrength = (horizontalEdge + verticalEdge) / 2;

      const offset = (row * ANALYSIS_WIDTH + column) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const channelMin = Math.min(r, g, b);
      const channelMax = Math.max(r, g, b);

      luminanceTotal += center;
      luminanceSquareTotal += center * center;
      edgeTotal += edgeStrength;
      if (edgeStrength > 16) textEdges++;
      if (Math.abs(center - 127) > 22 || edgeStrength > 24) {
        foregroundCount++;
        weightedX += column;
        weightedY += row;
      }
      colorSpreadTotal += channelMax - channelMin;
      if (r > 70 && g > 40 && b > 25 && r > g && r > b && r - Math.min(g, b) > 28) {
        skinToneCount++;
      }
      sampledPixels++;
    }
  }

  if (sampledPixels === 0) return null;

  const mean = luminanceTotal / sampledPixels;
  return {
    luminanceMean: mean,
    luminanceVariance: Math.max(0, luminanceSquareTotal / sampledPixels - mean * mean),
    edgeDensity: edgeTotal / sampledPixels,
    textEdgeDensity: textEdges / sampledPixels,
    foregroundRatio: foregroundCount / sampledPixels,
    colorfulness: colorSpreadTotal / sampledPixels,
    skinToneRatio: skinToneCount / sampledPixels,
    centerX: foregroundCount ? weightedX / foregroundCount / ANALYSIS_WIDTH : 0.5,
    centerY: foregroundCount ? weightedY / foregroundCount / analysisHeight : 0.5,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function classify(metrics: FrameMetrics): PackageDetectionResult {
  const {
    luminanceVariance,
    edgeDensity,
    textEdgeDensity,
    foregroundRatio,
    colorfulness,
    skinToneRatio,
    centerX,
    centerY,
  } = metrics;

  const inFrame =
    centerX >= SCANNER_INNER_BOX.left &&
    centerX <= SCANNER_INNER_BOX.right &&
    centerY >= SCANNER_INNER_BOX.top &&
    centerY <= SCANNER_INNER_BOX.bottom;

  const result = { centerX, centerY };

  // Blank / featureless frame — nothing to scan.
  if (luminanceVariance < 40 || edgeDensity < 1.6 || foregroundRatio < 0.008) {
    return {
      ...result,
      detected: false,
      category: 'unknown',
      confidence: 0,
      inFrame,
      stability: 0,
    };
  }

  // A person dominating the frame: large skin-tone region with low label noise.
  if (skinToneRatio > 0.16 && textEdgeDensity < 0.05) {
    return {
      ...result,
      detected: false,
      category: 'person',
      confidence: clamp01(skinToneRatio * 2),
      inFrame,
      stability: 0,
    };
  }

  // Packaged food typically has dense small text/label edges and vivid colour.
  const hasTexturedLabel =
    textEdgeDensity >= 0.04 &&
    edgeDensity >= 2.4 &&
    colorfulness >= 6 &&
    foregroundRatio >= 0.06;

  if (hasTexturedLabel && inFrame && foregroundRatio <= 0.96) {
    const confidence = clamp01(
      (textEdgeDensity / 0.12) * 0.6 +
        (colorfulness / 45) * 0.2 +
        Math.min(foregroundRatio / 0.45, 1) * 0.2
    );
    return {
      ...result,
      detected: true,
      category: 'food_package',
      confidence,
      inFrame,
      stability: 0,
    };
  }

  // A textured object is present but does not satisfy the food-label profile.
  if (edgeDensity >= 2.2) {
    return {
      ...result,
      detected: false,
      category: 'non_food_object',
      confidence: clamp01(0.3 + textEdgeDensity * 0.8),
      inFrame,
      stability: 0,
    };
  }

  return {
    ...result,
    detected: false,
    category: 'unknown',
    confidence: 0,
    inFrame,
    stability: 0,
  };
}

/**
 * Heuristic frame analysis used by the scanner's auto-capture loop.
 * Returns millisecond-quality heuristics used for post-capture badges:
 * sharpness 0–100, lighting 0–100, motion/centre drift.
 */
export function assessCaptureQuality(video: HTMLVideoElement, canvas: HTMLCanvasElement): {
  sharpness: number;
  lighting: number;
  centering: number;
} {
  const metrics = computeMetrics(video, canvas);
  if (!metrics) return { sharpness: 0, lighting: 0, centering: 0 };
  return {
    sharpness: Math.round(clamp01((metrics.edgeDensity - 1.5) / 8) * 100),
    lighting: Math.round(clamp01(1 - Math.abs(metrics.luminanceMean - 120) / 140) * 100),
    centering: Math.round(
      clamp01(
        1 -
          (Math.abs(metrics.centerX - 0.5) + Math.abs(metrics.centerY - 0.5)) /
            (SCANNER_INNER_BOX.right - SCANNER_INNER_BOX.left)
      ) * 100
    ),
  };
}

export const heuristicPackageDetector: PackageDetectionService = {
  analyze(video, canvas): PackageDetectionResult {
    const metrics = computeMetrics(video, canvas);
    if (!metrics) {
      return {
        detected: false,
        category: 'unknown',
        confidence: 0,
        inFrame: false,
        stability: 0,
        centerX: 0.5,
        centerY: 0.5,
      };
    }
    const result = classify(metrics);
    return result;
  },
};

/**
 * Downscaled grayscale fingerprint of the current video frame. Used to detect
 * frame change (e.g. the package being turned around) so the same side is not
 * re-captured.
 */
export function frameSignature(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement | null
): Uint8Array | null {
  if (!canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
    return null;
  }
  const width = 24;
  const height = Math.max(10, Math.round(width * (video.videoHeight / video.videoWidth)));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  const signature = new Uint8Array(width * height);
  for (let index = 0; index < signature.length; index++) {
    const offset = index * 4;
    signature[index] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
  }
  return signature;
}

export function signatureDiff(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 1;
  let total = 0;
  for (let index = 0; index < length; index++) {
    total += Math.abs(a[index] - b[index]);
  }
  return total / length / 255;
}

export type { ObjectCategory, PackageDetectionResult };