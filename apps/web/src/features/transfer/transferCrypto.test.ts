import { describe, expect, it } from 'vitest';

import {
  decryptTransferBlobToShimmy,
  encryptShimmyBlobForTransfer,
  normalizeTransferCode,
  TransferCryptoError,
  validateTransferPin
} from './transferCrypto';

describe('transferCrypto', () => {
  it('validateTransferPin accepts 4 digits', () => {
    expect(() => validateTransferPin('0000')).not.toThrow();
    expect(() => validateTransferPin('1234')).not.toThrow();
  });

  it('validateTransferPin rejects invalid pins', () => {
    expect(() => validateTransferPin('')).toThrow(TransferCryptoError);
    expect(() => validateTransferPin('12')).toThrow(TransferCryptoError);
    expect(() => validateTransferPin('abcd')).toThrow(TransferCryptoError);
    expect(() => validateTransferPin('12345')).toThrow(TransferCryptoError);
  });

  it('normalizeTransferCode trims and validates 5 digits', () => {
    expect(normalizeTransferCode(' 01234 ')).toBe('01234');
    expect(() => normalizeTransferCode('1234')).toThrow(TransferCryptoError);
    expect(() => normalizeTransferCode('12a45')).toThrow(TransferCryptoError);
  });

  it('encrypt -> decrypt roundtrip', async () => {
    const plain = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'application/x-shimmy' });
    const encrypted = await encryptShimmyBlobForTransfer(plain, '1234');
    expect(encrypted.size).toBeGreaterThan(plain.size);

    const decrypted = await decryptTransferBlobToShimmy(encrypted, '1234');
    const decryptedBytes = new Uint8Array(await decrypted.arrayBuffer());
    expect(Array.from(decryptedBytes)).toEqual([1, 2, 3, 4, 5]);
  });

  it('decrypt rejects wrong pin', async () => {
    const plain = new Blob([new Uint8Array([9, 8, 7])], { type: 'application/x-shimmy' });
    const encrypted = await encryptShimmyBlobForTransfer(plain, '1234');
    await expect(decryptTransferBlobToShimmy(encrypted, '0000')).rejects.toThrow(TransferCryptoError);
  });
});

