import { generateAssetPreview } from './thumbnailGenerator';

const DB_NAME = 'gacha-asset-store';
const DB_VERSION = 2;
const STORE_NAME = 'assets';
const BLOB_STORE_NAME = 'assetBlobs';

interface AssetMetadataRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  previewBlob: Blob | null;
}

interface AssetBlobRecord {
  id: string;
  blob: Blob;
}

export interface StoredAssetRecord extends AssetMetadataRecord {
  blob: Blob;
}

export interface StoredAssetMetadata extends Omit<StoredAssetRecord, 'blob'> {}

export interface StoredAssetPreviewRecord extends StoredAssetMetadata {}

let openRequest: Promise<IDBDatabase> | null = null;

function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function generateAssetId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function wrapRequest<T>(request: IDBRequest<T>, errorMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result as T);
    };
    request.onerror = () => {
      reject(request.error ?? new Error(errorMessage));
    };
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!isBrowserEnvironment()) {
    throw new Error('IndexedDB is not available in the current environment');
  }

  if (openRequest) {
    return openRequest;
  }

  openRequest = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open asset database'));
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;

      if (!transaction) {
        return;
      }

      let metadataStore: IDBObjectStore;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        metadataStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        metadataStore.createIndex('by-updatedAt', 'updatedAt');
      } else {
        metadataStore = transaction.objectStore(STORE_NAME);
        if (!metadataStore.indexNames.contains('by-updatedAt')) {
          metadataStore.createIndex('by-updatedAt', 'updatedAt');
        }
      }

      if (!db.objectStoreNames.contains(BLOB_STORE_NAME)) {
        db.createObjectStore(BLOB_STORE_NAME, { keyPath: 'id' });
      }

      if ((event.oldVersion ?? 0) < 2) {
        const blobStore = transaction.objectStore(BLOB_STORE_NAME);

        const migrateRequest = metadataStore.openCursor();

        migrateRequest.onsuccess = () => {
          const cursor = migrateRequest.result as IDBCursorWithValue | null;
          if (!cursor) {
            return;
          }

          const value = cursor.value as AssetMetadataRecord & Partial<AssetBlobRecord> & { blob?: Blob };
          const { blob, previewBlob = null, ...rest } = value;
          const normalizedPreview = previewBlob instanceof Blob ? previewBlob : null;
          const metadataRecord: AssetMetadataRecord = {
            ...rest,
            previewBlob: normalizedPreview
          };

          cursor.update(metadataRecord);

          if (blob instanceof Blob) {
            blobStore.put({ id: metadataRecord.id, blob });
          }

          cursor.continue();
        };
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        openRequest = null;
      };
      resolve(db);
    };
  });

  return openRequest;
}

type TransactionMode = 'readonly' | 'readwrite';

async function runTransaction<T>(
  mode: TransactionMode,
  storeNames: string[],
  handler: (transaction: IDBTransaction) => Promise<T>
): Promise<T> {
  const db = await openDatabase();
  return await new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    let operationResult: T;
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    transaction.oncomplete = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(operationResult);
    };

    transaction.onerror = () => {
      fail(transaction.error ?? new Error('Asset transaction failed'));
    };

    transaction.onabort = () => {
      fail(transaction.error ?? new Error('Asset transaction aborted'));
    };

    handler(transaction)
      .then((result) => {
        operationResult = result;
        if (typeof transaction.commit === 'function') {
          try {
            transaction.commit();
          } catch (error) {
            fail(error);
          }
        }
      })
      .catch((error) => {
        fail(error);
        try {
          transaction.abort();
        } catch (abortError) {
          console.error('Failed to abort asset transaction', abortError);
        }
      });
  });
}

export async function saveAsset(file: File): Promise<StoredAssetRecord> {
  if (!isBrowserEnvironment()) {
    throw new Error('IndexedDB is not available in the current environment');
  }

  const timestamp = new Date().toISOString();
  let previewBlob: Blob | null = null;

  try {
    previewBlob = await generateAssetPreview(file);
  } catch (error) {
    console.warn('Failed to generate preview for asset', error);
    previewBlob = null;
  }

  const metadataRecord: AssetMetadataRecord = {
    id: generateAssetId(),
    name: file.name,
    type: file.type,
    size: file.size,
    createdAt: timestamp,
    updatedAt: timestamp,
    previewBlob
  };

  await runTransaction('readwrite', [STORE_NAME, BLOB_STORE_NAME], async (transaction) => {
    const metadataStore = transaction.objectStore(STORE_NAME);
    const blobStore = transaction.objectStore(BLOB_STORE_NAME);

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const request = metadataStore.put(metadataRecord);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('Failed to store asset metadata'));
      }),
      new Promise<void>((resolve, reject) => {
        const request = blobStore.put({ id: metadataRecord.id, blob: file } satisfies AssetBlobRecord);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('Failed to store asset blob'));
      })
    ]);

    return metadataRecord;
  });

  return { ...metadataRecord, blob: file };
}

export async function loadAsset(assetId: string): Promise<StoredAssetRecord | null> {
  if (!isBrowserEnvironment()) {
    return null;
  }

  try {
    return await runTransaction('readonly', [STORE_NAME, BLOB_STORE_NAME], async (transaction) => {
      const metadataStore = transaction.objectStore(STORE_NAME);
      const blobStore = transaction.objectStore(BLOB_STORE_NAME);

      const metadata = (await wrapRequest<AssetMetadataRecord | undefined>(
        metadataStore.get(assetId),
        'Failed to load asset metadata'
      )) ?? null;

      if (!metadata) {
        return null;
      }

      const blobRecord = (await wrapRequest<AssetBlobRecord | undefined>(
        blobStore.get(assetId),
        'Failed to load asset blob'
      )) ?? null;

      if (!blobRecord || !(blobRecord.blob instanceof Blob)) {
        throw new Error('Asset blob is missing');
      }

      return { ...metadata, blob: blobRecord.blob } satisfies StoredAssetRecord;
    });
  } catch (error) {
    console.error('Failed to load asset from IndexedDB', error);
    return null;
  }
}

export async function loadAssetPreview(assetId: string): Promise<StoredAssetPreviewRecord | null> {
  if (!isBrowserEnvironment()) {
    return null;
  }

  try {
    return await runTransaction('readonly', [STORE_NAME], async (transaction) => {
      const metadataStore = transaction.objectStore(STORE_NAME);
      const metadata = (await wrapRequest<AssetMetadataRecord | undefined>(
        metadataStore.get(assetId),
        'Failed to load asset preview'
      )) ?? null;

      return metadata ? ({ ...metadata } satisfies StoredAssetPreviewRecord) : null;
    });
  } catch (error) {
    console.error('Failed to load asset preview from IndexedDB', error);
    return null;
  }
}

export async function deleteAsset(assetId: string): Promise<void> {
  if (!isBrowserEnvironment()) {
    return;
  }

  try {
    await runTransaction('readwrite', [STORE_NAME, BLOB_STORE_NAME], async (transaction) => {
      const metadataStore = transaction.objectStore(STORE_NAME);
      const blobStore = transaction.objectStore(BLOB_STORE_NAME);

      await Promise.all([
        wrapRequest(metadataStore.delete(assetId), 'Failed to delete asset metadata'),
        wrapRequest(blobStore.delete(assetId), 'Failed to delete asset blob')
      ]);

      return undefined;
    });
  } catch (error) {
    console.error('Failed to delete asset from IndexedDB', error);
  }
}

export async function deleteAllAssets(): Promise<void> {
  if (!isBrowserEnvironment()) {
    return;
  }

  try {
    await runTransaction('readwrite', [STORE_NAME, BLOB_STORE_NAME], async (transaction) => {
      const metadataStore = transaction.objectStore(STORE_NAME);
      const blobStore = transaction.objectStore(BLOB_STORE_NAME);

      await Promise.all([
        wrapRequest(metadataStore.clear(), 'Failed to clear asset metadata'),
        wrapRequest(blobStore.clear(), 'Failed to clear asset blobs')
      ]);

      return undefined;
    });
  } catch (error) {
    console.error('Failed to clear assets from IndexedDB', error);
    throw error instanceof Error
      ? error
      : new Error('Failed to clear assets from IndexedDB');
  }
}

export async function getAssetMetadata(assetId: string): Promise<StoredAssetMetadata | null> {
  const record = await loadAssetPreview(assetId);
  return record;
}

export async function exportAllAssets(): Promise<StoredAssetRecord[]> {
  if (!isBrowserEnvironment()) {
    return [];
  }

  try {
    return await runTransaction('readonly', [STORE_NAME, BLOB_STORE_NAME], async (transaction) => {
      const metadataStore = transaction.objectStore(STORE_NAME);
      const blobStore = transaction.objectStore(BLOB_STORE_NAME);

      const metadataRecords = await wrapRequest<AssetMetadataRecord[]>(
        metadataStore.getAll(),
        'Failed to fetch asset metadata'
      );

      const records = await Promise.all(
        metadataRecords.map(async (metadata) => {
          const blobRecord = (await wrapRequest<AssetBlobRecord | undefined>(
            blobStore.get(metadata.id),
            'Failed to fetch asset blob'
          )) ?? null;

          if (!blobRecord || !(blobRecord.blob instanceof Blob)) {
            return null;
          }

          return { ...metadata, blob: blobRecord.blob } satisfies StoredAssetRecord;
        })
      );

      return records.filter((record): record is StoredAssetRecord => record !== null);
    });
  } catch (error) {
    console.error('Failed to export assets from IndexedDB', error);
    return [];
  }
}

export async function importAssets(records: StoredAssetRecord[]): Promise<void> {
  if (!isBrowserEnvironment() || records.length === 0) {
    return;
  }

  await runTransaction('readwrite', [STORE_NAME, BLOB_STORE_NAME], async (transaction) => {
    const metadataStore = transaction.objectStore(STORE_NAME);
    const blobStore = transaction.objectStore(BLOB_STORE_NAME);

    await Promise.all(
      records.map(async (record) => {
        const metadata: AssetMetadataRecord = {
          id: record.id,
          name: record.name,
          type: record.type,
          size: record.size,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          previewBlob: record.previewBlob ?? null
        };

        await Promise.all([
          wrapRequest(metadataStore.put(metadata), 'Failed to import asset metadata'),
          wrapRequest(blobStore.put({ id: record.id, blob: record.blob } satisfies AssetBlobRecord), 'Failed to import asset blob')
        ]);
      })
    );
    return undefined;
  });
}
