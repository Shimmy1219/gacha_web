import JSZip from 'jszip';

import { loadReceiveZipInventory } from './receiveZip';

interface TestZipItemMetadata {
  filePath: string | null;
  gachaId: string | null;
  gachaName: string;
  itemId: string | null;
  itemName: string;
  rarity: string;
  rarityColor: string | null;
  isRiagu: boolean;
  riaguType: string | null;
  obtainedCount: number;
  isNewForUser: boolean;
  digitalItemType?: string;
}

async function buildReceiveZipWithItemMetadata(
  metadataMap: Record<string, TestZipItemMetadata>,
  itemPath: string,
  itemData: Uint8Array
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(itemPath, itemData, {
    binary: true,
    compression: 'STORE'
  });
  zip.file('meta/items.json', JSON.stringify(metadataMap, null, 2), {
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  return await zip.generateAsync({ type: 'uint8array' });
}

describe('loadReceiveZipInventory digital item type migration', () => {
  it('does not infer digital item type on plain read for legacy zip', async () => {
    const metadataMap: Record<string, TestZipItemMetadata> = {
      'asset-1': {
        filePath: 'items/TestGacha/item.mp3',
        gachaId: 'gacha-1',
        gachaName: 'TestGacha',
        itemId: 'item-1',
        itemName: 'BGM',
        rarity: 'R',
        rarityColor: '#ffffff',
        isRiagu: false,
        riaguType: null,
        obtainedCount: 1,
        isNewForUser: false
      }
    };
    const blob = await buildReceiveZipWithItemMetadata(
      metadataMap,
      'items/TestGacha/item.mp3',
      new Uint8Array([1, 2, 3])
    );

    const inventory = await loadReceiveZipInventory(blob);

    expect(inventory.metadataEntries).toHaveLength(1);
    expect(inventory.metadataEntries[0]?.digitalItemType).toBeUndefined();
    expect(inventory.migratedBlob).toBeUndefined();
  });

  it('migrates legacy zip and persists inferred type into items metadata', async () => {
    const metadataMap: Record<string, TestZipItemMetadata> = {
      'asset-1': {
        filePath: 'items/TestGacha/item.mp3',
        gachaId: 'gacha-1',
        gachaName: 'TestGacha',
        itemId: 'item-1',
        itemName: 'BGM',
        rarity: 'R',
        rarityColor: '#ffffff',
        isRiagu: false,
        riaguType: null,
        obtainedCount: 1,
        isNewForUser: false
      }
    };
    const blob = await buildReceiveZipWithItemMetadata(
      metadataMap,
      'items/TestGacha/item.mp3',
      new Uint8Array([1, 2, 3])
    );

    const migrated = await loadReceiveZipInventory(blob, { migrateDigitalItemTypes: true });

    expect(migrated.metadataEntries).toHaveLength(1);
    expect(migrated.metadataEntries[0]?.digitalItemType).toBe('audio');
    expect(migrated.migratedBlob).toBeInstanceOf(Blob);

    const migratedInput = migrated.migratedBlob instanceof Blob
      ? await migrated.migratedBlob.arrayBuffer()
      : blob;
    const reloaded = await loadReceiveZipInventory(migratedInput);
    expect(reloaded.metadataEntries[0]?.digitalItemType).toBe('audio');
  });

  it('removes digital item type from riagu item during migration', async () => {
    const metadataMap: Record<string, TestZipItemMetadata> = {
      'asset-1': {
        filePath: 'items/TestGacha/item.mp3',
        gachaId: 'gacha-1',
        gachaName: 'TestGacha',
        itemId: 'item-1',
        itemName: 'リアグ景品',
        rarity: 'R',
        rarityColor: '#ffffff',
        isRiagu: true,
        riaguType: null,
        obtainedCount: 1,
        isNewForUser: false,
        digitalItemType: 'audio'
      }
    };
    const blob = await buildReceiveZipWithItemMetadata(
      metadataMap,
      'items/TestGacha/item.mp3',
      new Uint8Array([1, 2, 3])
    );

    const migrated = await loadReceiveZipInventory(blob, { migrateDigitalItemTypes: true });

    expect(migrated.metadataEntries[0]?.digitalItemType).toBeUndefined();
    expect(migrated.migratedBlob).toBeInstanceOf(Blob);

    const migratedInput = migrated.migratedBlob instanceof Blob
      ? await migrated.migratedBlob.arrayBuffer()
      : blob;
    const zip = await JSZip.loadAsync(migratedInput);
    const itemsEntry = zip.file('meta/items.json');
    expect(itemsEntry).toBeDefined();
    const raw = JSON.parse(await itemsEntry!.async('string')) as Record<string, { digitalItemType?: string }>;
    expect(Object.prototype.hasOwnProperty.call(raw['asset-1'] ?? {}, 'digitalItemType')).toBe(false);
  });
});
