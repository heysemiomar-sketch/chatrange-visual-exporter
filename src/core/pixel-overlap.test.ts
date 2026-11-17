import { describe, expect, it } from 'vitest';

import type { PixelImage } from './pixel-overlap';

import { detectPixelOverlap } from './pixel-overlap';

function createPatternImage(width: number, height: number, rowOffset = 0): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const sourceY = y + rowOffset;

    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;

      data[offset] = (sourceY * 37 + x * 17) % 256;

      data[offset + 1] = (sourceY * 61 + x * 29) % 256;

      data[offset + 2] = (sourceY * 83 + x * 43) % 256;

      data[offset + 3] = 255;
    }
  }

  return {
    width,
    height,
    data,
  };
}

function createOverlappingImages(
  width: number,
  height: number,
  overlap: number,
): {
  previousImage: PixelImage;
  currentImage: PixelImage;
} {
  return {
    previousImage: createPatternImage(width, height, 0),

    currentImage: createPatternImage(width, height, height - overlap),
  };
}

describe('pixel overlap detection', () => {
  it('detects an exact overlap', () => {
    const { previousImage, currentImage } = createOverlappingImages(80, 120, 32);

    const result = detectPixelOverlap(previousImage, currentImage, {
      expectedOverlapPhysicalPx: 30,
      searchRadiusPhysicalPx: 8,
      sampleStepPhysicalPx: 1,
      minimumCandidateMargin: 0.001,
    });

    expect(result.accepted).toBe(true);

    expect(result.overlapPhysicalPx).toBe(32);

    expect(result.meanRgbDifference).toBe(0);

    expect(result.confidence).toBe(1);

    expect(result.usedGeometricFallback).toBe(false);
  });

  it('detects overlap above the geometric estimate', () => {
    const { previousImage, currentImage } = createOverlappingImages(72, 110, 44);

    const result = detectPixelOverlap(previousImage, currentImage, {
      expectedOverlapPhysicalPx: 36,
      searchRadiusPhysicalPx: 12,
      sampleStepPhysicalPx: 1,
      minimumCandidateMargin: 0.001,
    });

    expect(result.accepted).toBe(true);

    expect(result.overlapPhysicalPx).toBe(44);
  });

  it('uses the geometric fallback for unrelated images', () => {
    const previousImage = createPatternImage(64, 100, 0);

    const currentImage = createPatternImage(64, 100, 1000);

    const result = detectPixelOverlap(previousImage, currentImage, {
      expectedOverlapPhysicalPx: 24,
      searchRadiusPhysicalPx: 6,
      sampleStepPhysicalPx: 1,
      maximumMeanRgbDifference: 1,
    });

    expect(result.accepted).toBe(false);

    expect(result.usedGeometricFallback).toBe(true);

    expect(result.overlapPhysicalPx).toBe(24);
  });

  it('clamps the search range to valid image heights', () => {
    const { previousImage, currentImage } = createOverlappingImages(48, 40, 18);

    const result = detectPixelOverlap(previousImage, currentImage, {
      expectedOverlapPhysicalPx: 18,
      searchRadiusPhysicalPx: 80,
      sampleStepPhysicalPx: 1,
      minimumCandidateMargin: 0.001,
    });

    expect(result.evaluatedCandidateCount).toBe(39);

    expect(result.overlapPhysicalPx).toBe(18);
  });

  it('rejects image data with an invalid channel length', () => {
    const validImage = createPatternImage(20, 20);

    const invalidImage: PixelImage = {
      width: 20,
      height: 20,
      data: new Uint8ClampedArray(10),
    };

    expect(() => {
      detectPixelOverlap(invalidImage, validImage, {
        expectedOverlapPhysicalPx: 5,
      });
    }).toThrow('channel values');
  });

  it('rejects images that are too short', () => {
    const image = createPatternImage(20, 1);

    expect(() => {
      detectPixelOverlap(image, image, {
        expectedOverlapPhysicalPx: 1,
      });
    }).toThrow('too short');
  });
});
