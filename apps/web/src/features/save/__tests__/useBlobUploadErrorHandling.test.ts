import { describe, expect, it } from 'vitest';

import {
  BLOB_UPLOAD_ERROR_CODE_CSRF_TOKEN_MISMATCH,
  BlobUploadError,
  isBlobUploadCsrfTokenMismatchError
} from '../useBlobUpload';

describe('isBlobUploadCsrfTokenMismatchError', () => {
  it('returns true for BlobUploadError with csrf mismatch code', () => {
    const error = new BlobUploadError('csrf mismatch', {
      code: BLOB_UPLOAD_ERROR_CODE_CSRF_TOKEN_MISMATCH
    });
    expect(isBlobUploadCsrfTokenMismatchError(error)).toBe(true);
  });

  it('returns true when error message contains csrf token mismatch text', () => {
    const error = new Error('共有リンクの発行に失敗しました (Forbidden: CSRF token mismatch)');
    expect(isBlobUploadCsrfTokenMismatchError(error)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    const error = new Error('network timeout');
    expect(isBlobUploadCsrfTokenMismatchError(error)).toBe(false);
  });
});
