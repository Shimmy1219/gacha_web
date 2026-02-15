const HISTORY_STORAGE_KEY = 'receive:receive-history:v1';
const HISTORY_STORAGE_FALLBACK_KEY = 'receive:receive-hisotry:v1';
const DB_NAME = 'receive-history-store';
const DB_VERSION = 3;
const FILE_STORE_NAME = 'receiveFiles';
const THUMBNAIL_STORE_NAME = 'receiveThumbnails';
const THUMBNAIL_ENTRY_INDEX_NAME = 'entryId';

export interface ReceiveHistoryEntryMetadata {
  id: string;
  token?: string | null;
  name?: string | null;
  purpose?: string | null;
  expiresAt?: string | null;
  deletedAt?: string | null;
  gachaNames?: string[];
  itemNames?: string[];
  pullCount?: number;
  userName?: string | null;
  ownerName?: string | null;
  pullIds?: string[];
  downloadedAt: string;
  itemCount: number;
  totalBytes: number;
  previewItems: Array<{
    id: string;
    name: string;
    kind: string;
    size: number;
  }>;
}

interface ReceiveHistoryThumbnailStoredRecord {
  key: string;
  entryId: string;
  assetId: string;
  blob: Blob;
  width: number;
  height: number;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiveHistoryThumbnailRecord {
  entryId: string;
  assetId: string;
  blob: Blob;
  width: number;
  height: number;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createHistoryThumbnailKey(entryId: string, assetId: string): string {
  return `${entryId}:${assetId}`;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function sanitizeMetadata(raw: unknown): ReceiveHistoryEntryMetadata[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const id = typeof (entry as { id?: unknown }).id === 'string' ? (entry as { id: string }).id : null;
      const downloadedAt = typeof (entry as { downloadedAt?: unknown }).downloadedAt === 'string'
        ? (entry as { downloadedAt: string }).downloadedAt
        : null;
      const itemCount = Number.isFinite((entry as { itemCount?: unknown }).itemCount)
        ? Number((entry as { itemCount: number }).itemCount)
        : null;
      const totalBytes = Number.isFinite((entry as { totalBytes?: unknown }).totalBytes)
        ? Number((entry as { totalBytes: number }).totalBytes)
        : 0;

      if (!id || !downloadedAt || itemCount === null) {
        return null;
      }

      const previewItemsRaw = Array.isArray((entry as { previewItems?: unknown }).previewItems)
        ? ((entry as { previewItems: unknown[] }).previewItems ?? [])
        : [];
      const previewItems = previewItemsRaw
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const itemId = typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : null;
          const name = typeof (item as { name?: unknown }).name === 'string' ? (item as { name: string }).name : null;
          const kind = typeof (item as { kind?: unknown }).kind === 'string' ? (item as { kind: string }).kind : null;
          const size = Number.isFinite((item as { size?: unknown }).size) ? Number((item as { size: number }).size) : 0;
          if (!itemId || !name || !kind) {
            return null;
          }
          return { id: itemId, name, kind, size };
        })
        .filter((item): item is { id: string; name: string; kind: string; size: number } => Boolean(item));

      const gachaNamesRaw = Array.isArray((entry as { gachaNames?: unknown }).gachaNames)
        ? ((entry as { gachaNames: unknown[] }).gachaNames ?? [])
        : [];
      const gachaNames = gachaNamesRaw
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0);

      const itemNamesRaw = Array.isArray((entry as { itemNames?: unknown }).itemNames)
        ? ((entry as { itemNames: unknown[] }).itemNames ?? [])
        : [];
      const itemNames = itemNamesRaw
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0);

      const pullCount = Number.isFinite((entry as { pullCount?: unknown }).pullCount)
        ? Number((entry as { pullCount: number }).pullCount)
        : null;

      const pullIdsRaw = Array.isArray((entry as { pullIds?: unknown }).pullIds)
        ? ((entry as { pullIds: unknown[] }).pullIds ?? [])
        : [];
      const pullIds = pullIdsRaw
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0);
      const deletedAt =
        typeof (entry as { deletedAt?: unknown }).deletedAt === 'string'
          ? (entry as { deletedAt: string }).deletedAt
          : null;

      return {
        id,
        token: typeof (entry as { token?: unknown }).token === 'string' ? (entry as { token: string }).token : null,
        name: typeof (entry as { name?: unknown }).name === 'string' ? (entry as { name: string }).name : null,
        purpose: typeof (entry as { purpose?: unknown }).purpose === 'string' ? (entry as { purpose: string }).purpose : null,
        expiresAt:
          typeof (entry as { expiresAt?: unknown }).expiresAt === 'string'
            ? (entry as { expiresAt: string }).expiresAt
            : null,
        deletedAt,
        gachaNames: gachaNames.length > 0 ? Array.from(new Set(gachaNames)) : undefined,
        itemNames: itemNames.length > 0 ? Array.from(new Set(itemNames)) : undefined,
        pullCount: pullCount === null ? undefined : pullCount,
        userName: typeof (entry as { userName?: unknown }).userName === 'string' ? (entry as { userName: string }).userName : null,
        ownerName: typeof (entry as { ownerName?: unknown }).ownerName === 'string'
          ? (entry as { ownerName: string }).ownerName
          : null,
        pullIds: pullIds.length > 0 ? Array.from(new Set(pullIds)) : undefined,
        downloadedAt,
        itemCount,
        totalBytes,
        previewItems
      } satisfies ReceiveHistoryEntryMetadata;
    })
    .filter((entry): entry is ReceiveHistoryEntryMetadata => Boolean(entry))
    .sort((a, b) => Date.parse(b.downloadedAt) - Date.parse(a.downloadedAt));
}

export function loadHistoryMetadata(): ReceiveHistoryEntryMetadata[] {
  if (!isBrowser()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY) ?? window.localStorage.getItem(HISTORY_STORAGE_FALLBACK_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeMetadata(parsed);
  } catch (error) {
    console.error('Failed to read receive history metadata', error);
    return [];
  }
}

export function persistHistoryMetadata(entries: ReceiveHistoryEntryMetadata[]): void {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error('Failed to persist receive history metadata', error);
  }
}

function openHistoryDatabase(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error('Browser storage is unavailable'));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open receive history database'));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE_NAME)) {
        db.createObjectStore(FILE_STORE_NAME, { keyPath: 'id' });
      }
      // v3: drop old thumbnail store to regenerate all previews at 256px.
      if (db.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
        db.deleteObjectStore(THUMBNAIL_STORE_NAME);
      }
      const thumbnailStore = db.createObjectStore(THUMBNAIL_STORE_NAME, { keyPath: 'key' });
      thumbnailStore.createIndex(THUMBNAIL_ENTRY_INDEX_NAME, THUMBNAIL_ENTRY_INDEX_NAME, { unique: false });
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };
  });
}

async function runFileTransaction<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  return runStoreTransaction(FILE_STORE_NAME, mode, handler);
}

async function runThumbnailTransaction<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  return runStoreTransaction(THUMBNAIL_STORE_NAME, mode, handler);
}

async function runStoreTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openHistoryDatabase();
  return await new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    let settled = false;
    let hasHandlerResult = false;
    let handlerResult: T | undefined;

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        db.close();
      } catch (error) {
        console.warn('Failed to close receive history database', error);
      }
      callback();
    };

    const fail = (error: unknown) => {
      settle(() => {
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    };

    transaction.oncomplete = () => {
      settle(() => {
        resolve(hasHandlerResult ? (handlerResult as T) : (undefined as T));
      });
    };

    transaction.onerror = () => fail(transaction.error ?? new Error(`Receive history transaction failed (${storeName})`));
    transaction.onabort = () => fail(transaction.error ?? new Error(`Receive history transaction aborted (${storeName})`));

    void Promise.resolve()
      .then(() => handler(store))
      .then((result) => {
        hasHandlerResult = true;
        handlerResult = result;
        if (mode === 'readwrite' && typeof transaction.commit === 'function') {
          try {
            transaction.commit();
          } catch (error) {
            fail(error);
            return;
          }
        }
      })
      .catch((error) => {
        fail(error);
        try {
          transaction.abort();
        } catch (abortError) {
          console.error('Failed to abort receive history transaction', abortError);
        }
      });
  });
}

export async function saveHistoryFile(entryId: string, blob: Blob): Promise<void> {
  await runFileTransaction('readwrite', async (store) => {
    await new Promise<void>((resolve, reject) => {
      const request = store.put({ id: entryId, blob });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Failed to save receive file'));
    });
    return undefined;
  });
}

export async function loadHistoryFile(entryId: string): Promise<Blob | null> {
  try {
    return await runFileTransaction('readonly', async (store) => {
      const record = await new Promise<{ id: string; blob: Blob } | undefined>((resolve, reject) => {
        const request = store.get(entryId);
        request.onsuccess = () => resolve(request.result as { id: string; blob: Blob } | undefined);
        request.onerror = () => reject(request.error ?? new Error('Failed to load receive file'));
      });
      if (!record || !(record.blob instanceof Blob)) {
        return null;
      }
      return record.blob;
    });
  } catch (error) {
    console.error('Failed to load receive history file', error);
    return null;
  }
}

export async function deleteHistoryFile(entryId: string): Promise<void> {
  try {
    await runFileTransaction('readwrite', async (store) => {
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(entryId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('Failed to delete receive file'));
      });
      return undefined;
    });
    await deleteHistoryThumbnailsByEntry(entryId);
  } catch (error) {
    console.error('Failed to delete receive history file', error);
  }
}

export async function clearHistoryFiles(): Promise<void> {
  try {
    await runFileTransaction('readwrite', async (store) => {
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('Failed to clear receive files'));
      });
      return undefined;
    });
    await clearHistoryThumbnails();
  } catch (error) {
    console.error('Failed to clear receive history files', error);
  }
}

function sanitizeThumbnailRecord(record: ReceiveHistoryThumbnailStoredRecord | undefined): ReceiveHistoryThumbnailRecord | null {
  if (!record) {
    return null;
  }
  if (!(record.blob instanceof Blob)) {
    return null;
  }
  if (!record.entryId || !record.assetId) {
    return null;
  }
  return {
    entryId: record.entryId,
    assetId: record.assetId,
    blob: record.blob,
    width: Number.isFinite(record.width) ? Number(record.width) : 0,
    height: Number.isFinite(record.height) ? Number(record.height) : 0,
    mimeType: typeof record.mimeType === 'string' ? record.mimeType : null,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : ''
  };
}

function toStoredThumbnailRecord(record: ReceiveHistoryThumbnailRecord): ReceiveHistoryThumbnailStoredRecord {
  return {
    key: createHistoryThumbnailKey(record.entryId, record.assetId),
    entryId: record.entryId,
    assetId: record.assetId,
    blob: record.blob,
    width: record.width,
    height: record.height,
    mimeType: record.mimeType ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export async function saveHistoryThumbnail(record: ReceiveHistoryThumbnailRecord): Promise<void> {
  await saveHistoryThumbnails([record]);
}

export async function saveHistoryThumbnails(records: ReceiveHistoryThumbnailRecord[]): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const deduped = new Map<string, ReceiveHistoryThumbnailStoredRecord>();
  records.forEach((record) => {
    if (!record.entryId || !record.assetId || !(record.blob instanceof Blob)) {
      return;
    }
    deduped.set(createHistoryThumbnailKey(record.entryId, record.assetId), toStoredThumbnailRecord(record));
  });
  if (deduped.size === 0) {
    return;
  }

  try {
    await runThumbnailTransaction('readwrite', async (store) => {
      for (const record of deduped.values()) {
        await new Promise<void>((resolve, reject) => {
          const request = store.put(record);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error ?? new Error('Failed to save receive thumbnail'));
        });
      }
      return undefined;
    });
  } catch (error) {
    console.error('Failed to save receive history thumbnails', error);
  }
}

export async function loadHistoryThumbnail(entryId: string, assetId: string): Promise<ReceiveHistoryThumbnailRecord | null> {
  if (!entryId || !assetId) {
    return null;
  }
  try {
    return await runThumbnailTransaction('readonly', async (store) => {
      const key = createHistoryThumbnailKey(entryId, assetId);
      const record = await new Promise<ReceiveHistoryThumbnailStoredRecord | undefined>((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result as ReceiveHistoryThumbnailStoredRecord | undefined);
        request.onerror = () => reject(request.error ?? new Error('Failed to load receive thumbnail'));
      });
      return sanitizeThumbnailRecord(record);
    });
  } catch (error) {
    console.error('Failed to load receive history thumbnail', error);
    return null;
  }
}

export async function loadHistoryThumbnailsByEntry(entryId: string): Promise<ReceiveHistoryThumbnailRecord[]> {
  if (!entryId) {
    return [];
  }
  try {
    return await runThumbnailTransaction('readonly', async (store) => {
      const records = await new Promise<ReceiveHistoryThumbnailStoredRecord[]>((resolve, reject) => {
        if (store.indexNames.contains(THUMBNAIL_ENTRY_INDEX_NAME)) {
          const index = store.index(THUMBNAIL_ENTRY_INDEX_NAME);
          const request = index.getAll(IDBKeyRange.only(entryId));
          request.onsuccess = () => resolve((request.result ?? []) as ReceiveHistoryThumbnailStoredRecord[]);
          request.onerror = () => reject(request.error ?? new Error('Failed to load receive thumbnails by entry'));
          return;
        }
        const fallbackRequest = store.getAll();
        fallbackRequest.onsuccess = () => {
          const allRecords = (fallbackRequest.result ?? []) as ReceiveHistoryThumbnailStoredRecord[];
          resolve(allRecords.filter((record) => record.entryId === entryId));
        };
        fallbackRequest.onerror = () => reject(fallbackRequest.error ?? new Error('Failed to load receive thumbnails'));
      });
      return records
        .map((record) => sanitizeThumbnailRecord(record))
        .filter((record): record is ReceiveHistoryThumbnailRecord => Boolean(record));
    });
  } catch (error) {
    console.error('Failed to load receive history thumbnails', error);
    return [];
  }
}

export async function loadHistoryThumbnailBlobMap(entryId: string): Promise<Map<string, Blob>> {
  const records = await loadHistoryThumbnailsByEntry(entryId);
  const map = new Map<string, Blob>();
  records.forEach((record) => {
    map.set(record.assetId, record.blob);
  });
  return map;
}

export async function listHistoryThumbnailAssetIds(entryId: string): Promise<string[]> {
  const records = await loadHistoryThumbnailsByEntry(entryId);
  return records.map((record) => record.assetId);
}

export async function deleteHistoryThumbnailsByEntry(entryId: string): Promise<void> {
  if (!entryId) {
    return;
  }
  try {
    await runThumbnailTransaction('readwrite', async (store) => {
      const keysToDelete = await new Promise<string[]>((resolve, reject) => {
        if (store.indexNames.contains(THUMBNAIL_ENTRY_INDEX_NAME)) {
          const index = store.index(THUMBNAIL_ENTRY_INDEX_NAME);
          const request = index.getAllKeys(IDBKeyRange.only(entryId));
          request.onsuccess = () => resolve((request.result ?? []) as string[]);
          request.onerror = () => reject(request.error ?? new Error('Failed to list thumbnail keys for deletion'));
          return;
        }
        const fallback = store.getAll();
        fallback.onsuccess = () => {
          const records = (fallback.result ?? []) as ReceiveHistoryThumbnailStoredRecord[];
          resolve(
            records
              .filter((record) => record.entryId === entryId)
              .map((record) => record.key)
          );
        };
        fallback.onerror = () => reject(fallback.error ?? new Error('Failed to list thumbnail keys'));
      });

      for (const key of keysToDelete) {
        await new Promise<void>((resolve, reject) => {
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error ?? new Error('Failed to delete receive thumbnail'));
        });
      }
      return undefined;
    });
  } catch (error) {
    console.error('Failed to delete receive history thumbnails', error);
  }
}

export async function clearHistoryThumbnails(): Promise<void> {
  try {
    await runThumbnailTransaction('readwrite', async (store) => {
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('Failed to clear receive thumbnails'));
      });
      return undefined;
    });
  } catch (error) {
    console.error('Failed to clear receive history thumbnails', error);
  }
}

export function generateHistoryId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `receive-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isHistoryStorageAvailable(): boolean {
  return isBrowser();
}
