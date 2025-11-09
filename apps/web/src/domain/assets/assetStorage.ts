import { generateAssetPreview } from './thumbnailGenerator';

const DB_NAME = 'gacha-asset-store';
const DB_VERSION = 3;
const STORE_NAME = 'assets';
const BLOB_STORE_NAME = 'assetBlobs';
const PREVIEW_STORE_NAME = 'assetPreviews';

interface AssetMetadataRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  previewId: string | null;
  previewType: string | null;
  previewSize: number | null;
}

interface AssetBlobRecord {
  id: string;
  blob: Blob;
}

interface AssetPreviewBlobRecord {
  id: string;
  assetId: string;
  blob: Blob;
  type: string;
  size: number;
  updatedAt: string;
}

export interface StoredAssetRecord extends AssetMetadataRecord {
  blob: Blob;
  previewBlob: Blob | null;
}

export interface StoredAssetMetadata extends AssetMetadataRecord {}

export interface StoredAssetPreviewRecord extends AssetMetadataRecord {
  previewBlob: Blob | null;
}

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

function generatePreviewId(assetId: string): string {
  return `${assetId}:preview`;
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

      const oldVersion = event.oldVersion ?? 0;

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

      let blobStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(BLOB_STORE_NAME)) {
        blobStore = db.createObjectStore(BLOB_STORE_NAME, { keyPath: 'id' });
      } else {
        blobStore = transaction.objectStore(BLOB_STORE_NAME);
      }

      let previewStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(PREVIEW_STORE_NAME)) {
        previewStore = db.createObjectStore(PREVIEW_STORE_NAME, { keyPath: 'id' });
        previewStore.createIndex('by-assetId', 'assetId', { unique: false });
      } else {
        previewStore = transaction.objectStore(PREVIEW_STORE_NAME);
        if (!previewStore.indexNames.contains('by-assetId')) {
          previewStore.createIndex('by-assetId', 'assetId', { unique: false });
        }
      }

      if (oldVersion < 3) {
        const migrateRequest = metadataStore.openCursor();

        migrateRequest.onsuccess = () => {
          const cursor = migrateRequest.result as IDBCursorWithValue | null;
          if (!cursor) {
            return;
          }

          const value = cursor.value as Record<string, unknown>;
          const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : null;

          if (!id) {
            cursor.delete();
            cursor.continue();
            return;
          }

          const blob = value.blob instanceof Blob ? value.blob : null;
          const previewBlob = value.previewBlob instanceof Blob ? value.previewBlob : null;
          const existingPreviewId = typeof value.previewId === 'string' && value.previewId.length > 0 ? value.previewId : null;
          const fallbackPreviewType = typeof value.previewType === 'string' && value.previewType.length > 0 ? value.previewType : null;
          const fallbackPreviewSize = typeof value.previewSize === 'number' && Number.isFinite(value.previewSize)
            ? Number(value.previewSize)
            : null;

          const metadataRecord: AssetMetadataRecord = {
            id,
            name: typeof value.name === 'string' ? value.name : id,
            type: typeof value.type === 'string' ? value.type : 'application/octet-stream',
            size: typeof value.size === 'number' && Number.isFinite(value.size) ? Number(value.size) : 0,
            createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
            updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
            previewId: null,
            previewType: fallbackPreviewType,
            previewSize: fallbackPreviewSize
          };

          if (blob instanceof Blob) {
            blobStore.put({ id: metadataRecord.id, blob });
          }

          if (previewBlob instanceof Blob) {
            const assignedPreviewId = existingPreviewId ?? generatePreviewId(metadataRecord.id);
            const previewRecord: AssetPreviewBlobRecord = {
              id: assignedPreviewId,
              assetId: metadataRecord.id,
              blob: previewBlob,
              type: previewBlob.type || fallbackPreviewType || 'application/octet-stream',
              size: previewBlob.size ?? fallbackPreviewSize ?? 0,
              updatedAt: metadataRecord.updatedAt
            };
            previewStore.put(previewRecord);
            metadataRecord.previewId = assignedPreviewId;
            metadataRecord.previewType = previewRecord.type;
            metadataRecord.previewSize = previewRecord.size;
          } else if (existingPreviewId) {
            metadataRecord.previewId = existingPreviewId;
          }

          cursor.update(metadataRecord);
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
  let previewRecord: AssetPreviewBlobRecord | null = null;

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
    previewId: null,
    previewType: null,
    previewSize: null
  };

  if (previewBlob instanceof Blob) {
    const previewId = generatePreviewId(metadataRecord.id);
    const previewType = previewBlob.type || 'image/webp';
    const previewSize = Number.isFinite(previewBlob.size) ? previewBlob.size : null;
    metadataRecord.previewId = previewId;
    metadataRecord.previewType = previewType;
    metadataRecord.previewSize = previewSize;
    previewRecord = {
      id: previewId,
      assetId: metadataRecord.id,
      blob: previewBlob,
      type: previewType,
      size: previewSize ?? previewBlob.size,
      updatedAt: timestamp
    } satisfies AssetPreviewBlobRecord;
  }

  await runTransaction('readwrite', [STORE_NAME, BLOB_STORE_NAME, PREVIEW_STORE_NAME], async (transaction) => {
    const metadataStore = transaction.objectStore(STORE_NAME);
    const blobStore = transaction.objectStore(BLOB_STORE_NAME);
    const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);

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
      }),
      previewRecord
        ? new Promise<void>((resolve, reject) => {
            const request = previewStore.put(previewRecord);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error ?? new Error('Failed to store asset preview'));
          })
        : Promise.resolve()
    ]);

    return metadataRecord;
  });

  return { ...metadataRecord, blob: file, previewBlob };
}

export async function loadAsset(assetId: string): Promise<StoredAssetRecord | null> {
  if (!isBrowserEnvironment()) {
    return null;
  }

  try {
    return await runTransaction('readonly', [STORE_NAME, BLOB_STORE_NAME, PREVIEW_STORE_NAME], async (transaction) => {
      const metadataStore = transaction.objectStore(STORE_NAME);
      const blobStore = transaction.objectStore(BLOB_STORE_NAME);
      const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);

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

      let previewBlob: Blob | null = null;
      let previewType = metadata.previewType ?? null;
      let previewSize = metadata.previewSize ?? null;

      if (metadata.previewId) {
        const previewRecord = (await wrapRequest<AssetPreviewBlobRecord | undefined>(
          previewStore.get(metadata.previewId),
          'Failed to load asset preview'
        )) ?? null;

        if (previewRecord && previewRecord.blob instanceof Blob) {
          previewBlob = previewRecord.blob;
          previewType = previewRecord.type || previewBlob.type || previewType;
          previewSize = Number.isFinite(previewRecord.size)
            ? Number(previewRecord.size)
            : Number.isFinite(previewBlob.size)
              ? previewBlob.size
              : previewSize;
        }
      }

      const record: StoredAssetRecord = {
        ...metadata,
        previewType,
        previewSize,
        blob: blobRecord.blob,
        previewBlob
      };

      return record;
    });
  } catch (error) {
    console.error('Failed to load asset from IndexedDB', error);
    return null;
  }
}

export interface LoadAssetPreviewParams {
  assetId?: string | null;
  previewId?: string | null;
}

export async function loadAssetPreview({
  assetId,
  previewId
}: LoadAssetPreviewParams): Promise<StoredAssetPreviewRecord | null> {
  if (!isBrowserEnvironment()) {
    return null;
  }

  const requestedAssetId = assetId ?? null;
  const requestedPreviewId = previewId ?? requestedAssetId ?? null;

  if (!requestedAssetId && !requestedPreviewId) {
    return null;
  }

  try {
    return await runTransaction('readonly', [STORE_NAME, PREVIEW_STORE_NAME], async (transaction) => {
      const metadataStore = transaction.objectStore(STORE_NAME);
      const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);

      let metadata: AssetMetadataRecord | null = null;
      if (requestedAssetId) {
        metadata = (await wrapRequest<AssetMetadataRecord | undefined>(
          metadataStore.get(requestedAssetId),
          'Failed to load asset metadata for preview'
        )) ?? null;
      }

      let previewRecord: AssetPreviewBlobRecord | null = null;

      if (requestedPreviewId) {
        previewRecord = (await wrapRequest<AssetPreviewBlobRecord | undefined>(
          previewStore.get(requestedPreviewId),
          'Failed to load asset preview blob'
        )) ?? null;
      }

      if (!metadata && previewRecord?.assetId) {
        metadata = (await wrapRequest<AssetMetadataRecord | undefined>(
          metadataStore.get(previewRecord.assetId),
          'Failed to load asset metadata for preview'
        )) ?? null;
      }

      if (!metadata) {
        return null;
      }

      let previewBlob: Blob | null = null;
      let previewType = metadata.previewType ?? null;
      let previewSize = metadata.previewSize ?? null;
      let resolvedPreviewId = metadata.previewId ?? null;

      if (previewRecord && previewRecord.blob instanceof Blob) {
        previewBlob = previewRecord.blob;
        previewType = previewRecord.type || previewBlob.type || previewType;
        previewSize = Number.isFinite(previewRecord.size)
          ? Number(previewRecord.size)
          : Number.isFinite(previewBlob.size)
            ? previewBlob.size
            : previewSize;
        resolvedPreviewId = previewRecord.id;
      }

      const record: StoredAssetPreviewRecord = {
        ...metadata,
        previewId: resolvedPreviewId,
        previewType,
        previewSize,
        previewBlob
      };

      return record;
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
    await runTransaction('readwrite', [STORE_NAME, BLOB_STORE_NAME, PREVIEW_STORE_NAME], async (transaction) => {
      const metadataStore = transaction.objectStore(STORE_NAME);
      const blobStore = transaction.objectStore(BLOB_STORE_NAME);
      const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);

      const metadata = (await wrapRequest<AssetMetadataRecord | undefined>(
        metadataStore.get(assetId),
        'Failed to resolve asset metadata before deletion'
      )) ?? null;

      const previewIds = new Set<string>();
      if (metadata?.previewId) {
        previewIds.add(metadata.previewId);
      }
      previewIds.add(generatePreviewId(assetId));

      await Promise.all([
        wrapRequest(metadataStore.delete(assetId), 'Failed to delete asset metadata'),
        wrapRequest(blobStore.delete(assetId), 'Failed to delete asset blob'),
        Promise.all(
          Array.from(previewIds).map(async (previewId) => {
            await wrapRequest(previewStore.delete(previewId), 'Failed to delete asset preview');
          })
        )
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
    await runTransaction('readwrite', [STORE_NAME, BLOB_STORE_NAME, PREVIEW_STORE_NAME], async (transaction) => {
      const metadataStore = transaction.objectStore(STORE_NAME);
      const blobStore = transaction.objectStore(BLOB_STORE_NAME);
      const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);

      await Promise.all([
        wrapRequest(metadataStore.clear(), 'Failed to clear asset metadata'),
        wrapRequest(blobStore.clear(), 'Failed to clear asset blobs'),
        wrapRequest(previewStore.clear(), 'Failed to clear asset previews')
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
  const record = await loadAssetPreview({ assetId });
  if (!record) {
    return null;
  }

  const { previewBlob: _previewBlob, ...metadata } = record;
  return metadata;
}

export async function exportAllAssets(): Promise<StoredAssetRecord[]> {
  if (!isBrowserEnvironment()) {
    return [];
  }

  try {
    return await runTransaction('readonly', [STORE_NAME, BLOB_STORE_NAME, PREVIEW_STORE_NAME], async (transaction) => {
      const metadataStore = transaction.objectStore(STORE_NAME);
      const blobStore = transaction.objectStore(BLOB_STORE_NAME);
      const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);

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

          let previewBlob: Blob | null = null;
          let previewType = metadata.previewType ?? null;
          let previewSize = metadata.previewSize ?? null;

          if (metadata.previewId) {
            const previewRecord = (await wrapRequest<AssetPreviewBlobRecord | undefined>(
              previewStore.get(metadata.previewId),
              'Failed to fetch asset preview blob'
            )) ?? null;

            if (previewRecord && previewRecord.blob instanceof Blob) {
              previewBlob = previewRecord.blob;
              previewType = previewRecord.type || previewBlob.type || previewType;
              previewSize = Number.isFinite(previewRecord.size)
                ? Number(previewRecord.size)
                : Number.isFinite(previewBlob.size)
                  ? previewBlob.size
                  : previewSize;
            }
          }

          const record: StoredAssetRecord = {
            ...metadata,
            previewType,
            previewSize,
            blob: blobRecord.blob,
            previewBlob
          };

          return record;
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

  await runTransaction('readwrite', [STORE_NAME, BLOB_STORE_NAME, PREVIEW_STORE_NAME], async (transaction) => {
    const metadataStore = transaction.objectStore(STORE_NAME);
    const blobStore = transaction.objectStore(BLOB_STORE_NAME);
    const previewStore = transaction.objectStore(PREVIEW_STORE_NAME);

    await Promise.all(
      records.map(async (record) => {
        const basePreviewType = record.previewType ?? (record.previewBlob instanceof Blob ? record.previewBlob.type : null);
        const basePreviewSize = record.previewSize ?? (record.previewBlob instanceof Blob ? record.previewBlob.size : null);

        const metadata: AssetMetadataRecord = {
          id: record.id,
          name: record.name,
          type: record.type,
          size: record.size,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          previewId: null,
          previewType: basePreviewType ?? null,
          previewSize: basePreviewSize ?? null
        };

        let previewRecord: AssetPreviewBlobRecord | null = null;

        if (record.previewBlob instanceof Blob) {
          const assignedPreviewId = record.previewId ?? generatePreviewId(record.id);
          const previewType = basePreviewType ?? (record.previewBlob.type || 'image/webp');
          const previewSize = Number.isFinite(basePreviewSize) ? Number(basePreviewSize) : record.previewBlob.size;
          metadata.previewId = assignedPreviewId;
          metadata.previewType = previewType;
          metadata.previewSize = previewSize;
          previewRecord = {
            id: assignedPreviewId,
            assetId: record.id,
            blob: record.previewBlob,
            type: previewType,
            size: previewSize ?? record.previewBlob.size,
            updatedAt: record.updatedAt
          } satisfies AssetPreviewBlobRecord;
        } else if (record.previewId) {
          metadata.previewId = record.previewId;
        }

        await Promise.all([
          wrapRequest(metadataStore.put(metadata), 'Failed to import asset metadata'),
          wrapRequest(blobStore.put({ id: record.id, blob: record.blob } satisfies AssetBlobRecord), 'Failed to import asset blob'),
          previewRecord
            ? wrapRequest(previewStore.put(previewRecord), 'Failed to import asset preview')
            : Promise.resolve()
        ]);
      })
    );
    return undefined;
  });
}
