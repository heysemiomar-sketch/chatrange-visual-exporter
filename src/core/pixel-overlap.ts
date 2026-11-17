export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PixelOverlapOptions {
  expectedOverlapPhysicalPx: number;
  searchRadiusPhysicalPx?: number;
  horizontalInsetRatio?: number;
  sampleStepPhysicalPx?: number;
  maximumMeanRgbDifference?: number;
  minimumConfidence?: number;
  minimumCandidateMargin?: number;
}

export interface PixelOverlapCandidate {
  overlapPhysicalPx: number;
  meanRgbDifference: number;
  confidence: number;
}

export interface PixelOverlapResult {
  overlapPhysicalPx: number;
  expectedOverlapPhysicalPx: number;
  detectedOverlapPhysicalPx: number | null;
  meanRgbDifference: number | null;
  confidence: number;
  accepted: boolean;
  usedGeometricFallback: boolean;
  evaluatedCandidateCount: number;
}

const DEFAULT_SEARCH_RADIUS_PHYSICAL_PX = 80;

const DEFAULT_HORIZONTAL_INSET_RATIO = 0.15;

const DEFAULT_SAMPLE_STEP_PHYSICAL_PX = 4;

const DEFAULT_MAXIMUM_MEAN_RGB_DIFFERENCE = 18;

const DEFAULT_MINIMUM_CONFIDENCE = 0.8;

const DEFAULT_MINIMUM_CANDIDATE_MARGIN = 0.005;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function assertValidImage(image: PixelImage, label: string): void {
  if (
    !Number.isInteger(image.width) ||
    image.width <= 0 ||
    !Number.isInteger(image.height) ||
    image.height <= 0
  ) {
    throw new Error(`${label} has invalid dimensions.`);
  }

  const expectedLength = image.width * image.height * 4;

  if (image.data.length !== expectedLength) {
    throw new Error(
      `${label} contains ${image.data.length} channel values, ` +
        `but ${expectedLength} were expected.`,
    );
  }
}

function getPixelOffset(image: PixelImage, x: number, y: number): number {
  return (y * image.width + x) * 4;
}

function calculateCandidateDifference(
  previousImage: PixelImage,
  currentImage: PixelImage,
  overlapPhysicalPx: number,
  horizontalInsetRatio: number,
  sampleStepPhysicalPx: number,
): number {
  const sharedWidth = Math.min(previousImage.width, currentImage.width);

  const horizontalInset = Math.floor(sharedWidth * horizontalInsetRatio);

  const startX = clamp(horizontalInset, 0, sharedWidth - 1);

  const endX = clamp(sharedWidth - horizontalInset, startX + 1, sharedWidth);

  const previousStartY = previousImage.height - overlapPhysicalPx;

  let totalDifference = 0;
  let comparedChannelCount = 0;

  for (let rowOffset = 0; rowOffset < overlapPhysicalPx; rowOffset += sampleStepPhysicalPx) {
    const previousY = previousStartY + rowOffset;

    const currentY = rowOffset;

    for (let x = startX; x < endX; x += sampleStepPhysicalPx) {
      const previousOffset = getPixelOffset(previousImage, x, previousY);

      const currentOffset = getPixelOffset(currentImage, x, currentY);

      totalDifference += Math.abs(
        previousImage.data[previousOffset]! - currentImage.data[currentOffset]!,
      );

      totalDifference += Math.abs(
        previousImage.data[previousOffset + 1]! - currentImage.data[currentOffset + 1]!,
      );

      totalDifference += Math.abs(
        previousImage.data[previousOffset + 2]! - currentImage.data[currentOffset + 2]!,
      );

      comparedChannelCount += 3;
    }
  }

  if (comparedChannelCount === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return totalDifference / comparedChannelCount;
}

function differenceToConfidence(meanRgbDifference: number): number {
  if (!Number.isFinite(meanRgbDifference)) {
    return 0;
  }

  return clamp(1 - meanRgbDifference / 255, 0, 1);
}

function createCandidate(
  previousImage: PixelImage,
  currentImage: PixelImage,
  overlapPhysicalPx: number,
  horizontalInsetRatio: number,
  sampleStepPhysicalPx: number,
): PixelOverlapCandidate {
  const meanRgbDifference = calculateCandidateDifference(
    previousImage,
    currentImage,
    overlapPhysicalPx,
    horizontalInsetRatio,
    sampleStepPhysicalPx,
  );

  return {
    overlapPhysicalPx,
    meanRgbDifference,
    confidence: differenceToConfidence(meanRgbDifference),
  };
}

export function detectPixelOverlap(
  previousImage: PixelImage,
  currentImage: PixelImage,
  options: PixelOverlapOptions,
): PixelOverlapResult {
  assertValidImage(previousImage, 'The previous image');

  assertValidImage(currentImage, 'The current image');

  const maximumPossibleOverlap = Math.min(previousImage.height - 1, currentImage.height - 1);

  if (maximumPossibleOverlap < 1) {
    throw new Error('The images are too short for overlap detection.');
  }

  const expectedOverlapPhysicalPx = clamp(
    Math.round(options.expectedOverlapPhysicalPx),
    1,
    maximumPossibleOverlap,
  );

  const searchRadiusPhysicalPx = Math.max(
    0,
    Math.round(options.searchRadiusPhysicalPx ?? DEFAULT_SEARCH_RADIUS_PHYSICAL_PX),
  );

  const horizontalInsetRatio = clamp(
    options.horizontalInsetRatio ?? DEFAULT_HORIZONTAL_INSET_RATIO,
    0,
    0.45,
  );

  const sampleStepPhysicalPx = Math.max(
    1,
    Math.round(options.sampleStepPhysicalPx ?? DEFAULT_SAMPLE_STEP_PHYSICAL_PX),
  );

  const maximumMeanRgbDifference = Math.max(
    0,
    options.maximumMeanRgbDifference ?? DEFAULT_MAXIMUM_MEAN_RGB_DIFFERENCE,
  );

  const minimumConfidence = clamp(options.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE, 0, 1);

  const minimumCandidateMargin = Math.max(
    0,
    options.minimumCandidateMargin ?? DEFAULT_MINIMUM_CANDIDATE_MARGIN,
  );

  const minimumOverlap = clamp(
    expectedOverlapPhysicalPx - searchRadiusPhysicalPx,
    1,
    maximumPossibleOverlap,
  );

  const maximumOverlap = clamp(
    expectedOverlapPhysicalPx + searchRadiusPhysicalPx,
    minimumOverlap,
    maximumPossibleOverlap,
  );

  const candidates: PixelOverlapCandidate[] = [];

  for (
    let overlapPhysicalPx = minimumOverlap;
    overlapPhysicalPx <= maximumOverlap;
    overlapPhysicalPx += 1
  ) {
    candidates.push(
      createCandidate(
        previousImage,
        currentImage,
        overlapPhysicalPx,
        horizontalInsetRatio,
        sampleStepPhysicalPx,
      ),
    );
  }

  candidates.sort((first, second) => first.meanRgbDifference - second.meanRgbDifference);

  const bestCandidate = candidates[0];

  const secondCandidate = candidates[1];

  if (!bestCandidate) {
    return {
      overlapPhysicalPx: expectedOverlapPhysicalPx,
      expectedOverlapPhysicalPx,
      detectedOverlapPhysicalPx: null,
      meanRgbDifference: null,
      confidence: 0,
      accepted: false,
      usedGeometricFallback: true,
      evaluatedCandidateCount: 0,
    };
  }

  const candidateMargin = secondCandidate
    ? bestCandidate.confidence - secondCandidate.confidence
    : 1;

  const accepted =
    bestCandidate.meanRgbDifference <= maximumMeanRgbDifference &&
    bestCandidate.confidence >= minimumConfidence &&
    candidateMargin >= minimumCandidateMargin;

  return {
    overlapPhysicalPx: accepted ? bestCandidate.overlapPhysicalPx : expectedOverlapPhysicalPx,
    expectedOverlapPhysicalPx,
    detectedOverlapPhysicalPx: bestCandidate.overlapPhysicalPx,
    meanRgbDifference: bestCandidate.meanRgbDifference,
    confidence: bestCandidate.confidence,
    accepted,
    usedGeometricFallback: !accepted,
    evaluatedCandidateCount: candidates.length,
  };
}
