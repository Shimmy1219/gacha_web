const HISTORY_STORAGE_KEY = 'receive:receive-history:v1';
const HISTORY_STORAGE_FALLBACK_KEY = 'receive:receive-hisotry:v1';
const DB_NAME = 'receive-history-store';
const DB_VERSION = 1;
const FILE_STORE_NAME = 'receiveFiles';

export interface ReceiveHistoryEntryMetadata {
  id: string;
  token?: string | null;
  name?: string | null;
  purpose?: string | null;
  expiresAt?: string | null;
  gachaNames?: string[];
  itemNames?: string[];
  pullCount?: number;
  userName?: string | null;
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

      return {
        id,
        token: typeof (entry as { token?: unknown }).token === 'string' ? (entry as { token: string }).token : null,
        name: typeof (entry as { name?: unknown }).name === 'string' ? (entry as { name: string }).name : null,
        purpose: typeof (entry as { purpose?: unknown }).purpose === 'string' ? (entry as { purpose: string }).purpose : null,
        expiresAt:
          typeof (entry as { expiresAt?: unknown }).expiresAt === 'string'
            ? (entry as { expiresAt: string }).expiresAt
            : null,
        gachaNames: gachaNames.length > 0 ? Array.from(new Set(gachaNames)) : undefined,
        itemNames: itemNames.length > 0 ? Array.from(new Set(itemNames)) : undefined,
        pullCount: pullCount === null ? undefined : pullCount,
        userName: typeof (entry as { userName?: unknown }).userName === 'string' ? (entry as { userName: string }).userName : null,
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
  const db = await openHistoryDatabase();
  return await new Promise<T>((resolve, reject) => {
    const transaction = db.transaction([FILE_STORE_NAME], mode);
    const store = transaction.objectStore(FILE_STORE_NAME);

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
      resolve(undefined as T);
    };

    transaction.onerror = () => fail(transaction.error ?? new Error('Receive history transaction failed'));
    transaction.onabort = () => fail(transaction.error ?? new Error('Receive history transaction aborted'));

    handler(store)
      .then((result) => {
        if (typeof transaction.commit === 'function') {
          try {
            transaction.commit();
          } catch (error) {
            fail(error);
            return;
          }
        }
        resolve(result);
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
  } catch (error) {
    console.error('Failed to clear receive history files', error);
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
