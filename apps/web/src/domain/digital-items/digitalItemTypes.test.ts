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

  it('classifies 4:3 and 5:4 as simeji-background', () => {
    const ratio43 = inferDigitalItemTypeFromImageDimensions({
      width: 1200,
      height: 900,
      mimeType: 'image/png',
      fileName: 'simeji-43.png'
    });
    const ratio54 = inferDigitalItemTypeFromImageDimensions({
      width: 1250,
      height: 1000,
      mimeType: 'image/png',
      fileName: 'simeji-54.png'
    });

    expect(ratio43).toBe('simeji-background');
    expect(ratio54).toBe('simeji-background');
  });

  it('classifies 7:5 and 5:7 as nepuri', () => {
    const ratio75 = inferDigitalItemTypeFromImageDimensions({
      width: 1400,
      height: 1000,
      mimeType: 'image/png',
      fileName: 'nepuri-75.png'
    });
    const ratio57 = inferDigitalItemTypeFromImageDimensions({
      width: 1000,
      height: 1400,
      mimeType: 'image/png',
      fileName: 'nepuri-57.png'
    });

    expect(ratio75).toBe('nepuri');
    expect(ratio57).toBe('nepuri');
  });
});
