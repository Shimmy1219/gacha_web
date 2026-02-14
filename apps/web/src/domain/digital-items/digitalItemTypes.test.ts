import { inferDigitalItemTypeFromImageDimensions } from './digitalItemTypes';

describe('inferDigitalItemTypeFromImageDimensions', () => {
  it('classifies square PNG as icon-ring even when mime type is missing', () => {
    const result = inferDigitalItemTypeFromImageDimensions({
      width: 2048,
      height: 2048,
      mimeType: null,
      fileName: 'ring.png'
    });

    expect(result).toBe('icon-ring');
  });

  it('classifies 1125x480 as iriam-header', () => {
    const result = inferDigitalItemTypeFromImageDimensions({
      width: 1125,
      height: 480,
      mimeType: 'image/png',
      fileName: 'header.png'
    });

    expect(result).toBe('iriam-header');
  });

  it('classifies 2048x874 as iriam-header', () => {
    const result = inferDigitalItemTypeFromImageDimensions({
      width: 2048,
      height: 874,
      mimeType: 'image/png',
      fileName: 'header.png'
    });

    expect(result).toBe('iriam-header');
  });
});
