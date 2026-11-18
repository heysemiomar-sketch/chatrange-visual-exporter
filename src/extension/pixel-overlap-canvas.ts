import type { PixelImage, PixelOverlapResult } from '../core/pixel-overlap';

import { detectPixelOverlap } from '../core/pixel-overlap';

export interface PixelOverlapCanvasRegion {
  imageBitmap: ImageBitmap;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
}

export interface DetectCanvasOverlapInput {
  previousRegion: PixelOverlapCanvasRegion;
  currentRegion: PixelOverlapCanvasRegion;
  expectedOverlapPhysicalPx: number;
}

function assertValidRegion(region: PixelOverlapCanvasRegion, label: string): void {
  if (region.sourceWidth <= 0 || region.sourceHeight <= 0) {
    throw new Error(`${label} has invalid dimensions.`);
  }

  if (
    region.sourceX < 0 ||
    region.sourceY < 0 ||
    region.sourceX + region.sourceWidth > region.imageBitmap.width ||
    region.sourceY + region.sourceHeight > region.imageBitmap.height
  ) {
    throw new Error(`${label} is outside its source image.`);
  }
}

function createRegionCanvas(region: PixelOverlapCanvasRegion): HTMLCanvasElement {
  assertValidRegion(region, 'The canvas region');

  const canvas = document.createElement('canvas');

  canvas.width = region.sourceWidth;

  canvas.height = region.sourceHeight;

  const context = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error('A 2D context could not be created for pixel overlap detection.');
  }

  context.drawImage(
    region.imageBitmap,
    region.sourceX,
    region.sourceY,
    region.sourceWidth,
    region.sourceHeight,
    0,
    0,
    region.sourceWidth,
    region.sourceHeight,
  );

  return canvas;
}

function readPixelImage(region: PixelOverlapCanvasRegion): PixelImage {
  const canvas = createRegionCanvas(region);

  const context = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error('The pixel-overlap canvas context is unavailable.');
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  return {
    width: imageData.width,
    height: imageData.height,
    data: imageData.data,
  };
}

export function detectCanvasPixelOverlap(input: DetectCanvasOverlapInput): PixelOverlapResult {
  assertValidRegion(input.previousRegion, 'The previous region');

  assertValidRegion(input.currentRegion, 'The current region');

  const expectedOverlapPhysicalPx = Math.max(
    1,
    Math.min(
      Math.round(input.expectedOverlapPhysicalPx),
      input.previousRegion.sourceHeight - 1,
      input.currentRegion.sourceHeight - 1,
    ),
  );

  const maximumSearchRadius = Math.max(
    0,
    Math.min(
      80,
      expectedOverlapPhysicalPx - 1,
      input.previousRegion.sourceHeight - expectedOverlapPhysicalPx - 1,
      input.currentRegion.sourceHeight - expectedOverlapPhysicalPx - 1,
    ),
  );

  const previousImage = readPixelImage(input.previousRegion);

  const currentImage = readPixelImage(input.currentRegion);

  return detectPixelOverlap(previousImage, currentImage, {
    expectedOverlapPhysicalPx,
    searchRadiusPhysicalPx: maximumSearchRadius,
    horizontalInsetRatio: 0.15,
    sampleStepPhysicalPx: 4,
    maximumMeanRgbDifference: 18,
    minimumConfidence: 0.8,
    minimumCandidateMargin: 0.005,
  });
}
