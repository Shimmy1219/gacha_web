import JSZip from 'jszip';

import { loadReceiveZipInventory, updateReceiveZipDigitalItemType } from './receiveZip';

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

  it('updates digital item type in receive zip items metadata', async () => {
    const metadataMap: Record<string, TestZipItemMetadata> = {
      'asset-1': {
        filePath: 'items/TestGacha/item.png',
        gachaId: 'gacha-1',
        gachaName: 'TestGacha',
        itemId: 'item-1',
        itemName: '画像景品',
        rarity: 'SR',
        rarityColor: '#6366f1',
        isRiagu: false,
        riaguType: null,
        obtainedCount: 1,
        isNewForUser: false
      }
    };
    const blob = await buildReceiveZipWithItemMetadata(
      metadataMap,
      'items/TestGacha/item.png',
      new Uint8Array([137, 80, 78, 71])
    );

    const updateResult = await updateReceiveZipDigitalItemType(blob, {
      metadataIds: ['asset-1'],
      digitalItemType: 'nepuri'
    });

    expect(updateResult.updatedMetadataIds).toContain('asset-1');
    expect(updateResult.updatedBlob).toBeInstanceOf(Blob);

    const updatedInput = updateResult.updatedBlob instanceof Blob
      ? await updateResult.updatedBlob.arrayBuffer()
      : blob;
    const reloaded = await loadReceiveZipInventory(updatedInput);
    expect(reloaded.metadataEntries[0]?.digitalItemType).toBe('nepuri');
  });

  it('skips update when metadata id does not exist in receive zip', async () => {
    const metadataMap: Record<string, TestZipItemMetadata> = {
      'asset-1': {
        filePath: 'items/TestGacha/item.png',
        gachaId: 'gacha-1',
        gachaName: 'TestGacha',
        itemId: 'item-1',
        itemName: '画像景品',
        rarity: 'SR',
        rarityColor: '#6366f1',
        isRiagu: false,
        riaguType: null,
        obtainedCount: 1,
        isNewForUser: false
      }
    };
    const blob = await buildReceiveZipWithItemMetadata(
      metadataMap,
      'items/TestGacha/item.png',
      new Uint8Array([137, 80, 78, 71])
    );

    const updateResult = await updateReceiveZipDigitalItemType(blob, {
      metadataIds: ['missing-asset-id'],
      digitalItemType: 'nepuri'
    });

    expect(updateResult.updatedMetadataIds).toHaveLength(0);
    expect(updateResult.updatedBlob).toBeNull();
  });

  it.each([
    { fileName: 'item.mp3', expectedMimeType: 'audio/mpeg' },
    { fileName: 'item.m4a', expectedMimeType: 'audio/mp4' }
  ])('restores audio mime type from extension for $fileName', async ({ fileName, expectedMimeType }) => {
    const filePath = `items/TestGacha/${fileName}`;
    const metadataMap: Record<string, TestZipItemMetadata> = {
      'asset-1': {
        filePath,
        gachaId: 'gacha-1',
        gachaName: 'TestGacha',
        itemId: 'item-1',
        itemName: '音声景品',
        rarity: 'R',
        rarityColor: '#ffffff',
        isRiagu: false,
        riaguType: null,
        obtainedCount: 1,
        isNewForUser: false,
        digitalItemType: 'audio'
      }
    };
    const blob = await buildReceiveZipWithItemMetadata(
      metadataMap,
      filePath,
      new Uint8Array([1, 2, 3])
    );

    const inventory = await loadReceiveZipInventory(blob);
    expect(inventory.mediaItems).toHaveLength(1);
    expect(inventory.mediaItems[0]?.kind).toBe('audio');
    expect(inventory.mediaItems[0]?.mimeType).toBe(expectedMimeType);
    expect(inventory.mediaItems[0]?.blob.type).toBe(expectedMimeType);
  });
});
