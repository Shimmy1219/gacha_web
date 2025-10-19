const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function generateBase62IdSuffix(length = 10): string {
  const alphabetLength = BASE62_ALPHABET.length;
  if (length <= 0) {
    return '';
  }

  const cryptoInstance = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoInstance && typeof cryptoInstance.getRandomValues === 'function') {
    const randomValues = new Uint8Array(length);
    cryptoInstance.getRandomValues(randomValues);
    let suffix = '';
    for (let index = 0; index < length; index += 1) {
      suffix += BASE62_ALPHABET[randomValues[index] % alphabetLength];
    }
    return suffix;
  }

  let fallbackSuffix = '';
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * alphabetLength);
    fallbackSuffix += BASE62_ALPHABET[randomIndex];
  }
  return fallbackSuffix;
}

export function generatePrefixedId(prefix: string, length = 10): string {
  return `${prefix}${generateBase62IdSuffix(length)}`;
}
