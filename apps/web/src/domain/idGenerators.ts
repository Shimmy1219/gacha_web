export const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const ID_PREFIXES = {
  gacha: 'gch-',
  item: 'itm-',
  rarity: 'rar-',
  user: 'usr-',
  inventory: 'inv-',
  riagu: 'riagu-',
  ptBundle: 'bndl-',
  ptGuarantee: 'ptg-'
} as const;

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

export function generateDeterministicPrefixedId(prefix: string, seed: string, length = 10): string {
  const alphabetLength = BASE62_ALPHABET.length;

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }

  let value = hash || 1;
  let suffix = '';

  for (let position = 0; position < length; position += 1) {
    value = (value * 1664525 + 1013904223) >>> 0;
    suffix += BASE62_ALPHABET[value % alphabetLength];
  }

  return `${prefix}${suffix}`;
}

export function generateGachaId(): string {
  return generatePrefixedId(ID_PREFIXES.gacha);
}

export function generateDeterministicGachaId(seed: string, length = 10): string {
  return generateDeterministicPrefixedId(ID_PREFIXES.gacha, seed, length);
}

export function generateItemId(): string {
  return generatePrefixedId(ID_PREFIXES.item);
}

export function generateDeterministicItemId(seed: string, length = 10): string {
  return generateDeterministicPrefixedId(ID_PREFIXES.item, seed, length);
}

export function generateRarityId(): string {
  return generatePrefixedId(ID_PREFIXES.rarity);
}

export function generateDeterministicRarityId(seed: string, length = 10): string {
  return generateDeterministicPrefixedId(ID_PREFIXES.rarity, seed, length);
}

export function generateUserId(): string {
  return generatePrefixedId(ID_PREFIXES.user);
}

export function generateDeterministicUserId(seed: string, length = 10): string {
  return generateDeterministicPrefixedId(ID_PREFIXES.user, seed, length);
}

export function generateInventoryId(): string {
  return generatePrefixedId(ID_PREFIXES.inventory);
}

export function generateDeterministicInventoryId(seed: string, length = 10): string {
  return generateDeterministicPrefixedId(ID_PREFIXES.inventory, seed, length);
}

export function generateRiaguId(): string {
  return generatePrefixedId(ID_PREFIXES.riagu);
}

export function generateDeterministicRiaguId(seed: string, length = 10): string {
  return generateDeterministicPrefixedId(ID_PREFIXES.riagu, seed, length);
}

export function generatePtBundleId(): string {
  return generatePrefixedId(ID_PREFIXES.ptBundle);
}

export function generateDeterministicPtBundleId(seed: string, length = 10): string {
  return generateDeterministicPrefixedId(ID_PREFIXES.ptBundle, seed, length);
}

export function generatePtGuaranteeId(): string {
  return generatePrefixedId(ID_PREFIXES.ptGuarantee);
}

export function generateDeterministicPtGuaranteeId(seed: string, length = 10): string {
  return generateDeterministicPrefixedId(ID_PREFIXES.ptGuarantee, seed, length);
}
