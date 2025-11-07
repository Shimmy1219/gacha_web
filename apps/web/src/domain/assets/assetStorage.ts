const DB_NAME = 'gacha-asset-store';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

export interface StoredAssetRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  blob: Blob;
}

export interface StoredAssetMetadata extends Omit<StoredAssetRecord, 'blob'> {}

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

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by-updatedAt', 'updatedAt');
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
  handler: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDatabase();
  return await new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
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

    handler(store)
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
  const record: StoredAssetRecord = {
    id: generateAssetId(),
    name: file.name,
    type: file.type,
    size: file.size,
    createdAt: timestamp,
    updatedAt: timestamp,
    blob: file
  };

  await runTransaction('readwrite', async (store) => {
    await new Promise<void>((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Failed to store asset'));
    });
    return record;
  });

  return record;
}

export async function loadAsset(assetId: string): Promise<StoredAssetRecord | null> {
  if (!isBrowserEnvironment()) {
    return null;
  }

  try {
    return await runTransaction('readonly', async (store) => {
      return await new Promise<StoredAssetRecord | null>((resolve, reject) => {
        const request = store.get(assetId);
        request.onsuccess = () => {
          resolve((request.result as StoredAssetRecord | undefined) ?? null);
        };
        request.onerror = () => reject(request.error ?? new Error('Failed to load asset'));
      });
    });
  } catch (error) {
    console.error('Failed to load asset from IndexedDB', error);
    return null;
  }
}

export async function deleteAsset(assetId: string): Promise<void> {
  if (!isBrowserEnvironment()) {
    return;
  }

  try {
    await runTransaction('readwrite', async (store) => {
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(assetId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('Failed to delete asset'));
      });
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
    await runTransaction('readwrite', async (store) => {
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('Failed to clear assets'));
      });
      return undefined;
    });
  } catch (error) {
    console.error('Failed to clear assets from IndexedDB', error);
  }
}

export async function getAssetMetadata(assetId: string): Promise<StoredAssetMetadata | null> {
  const record = await loadAsset(assetId);
  if (!record) {
    return null;
  }

  const { blob: _blob, ...metadata } = record;
  return metadata;
}

export async function exportAllAssets(): Promise<StoredAssetRecord[]> {
  if (!isBrowserEnvironment()) {
    return [];
  }

  try {
    return await runTransaction('readonly', async (store) => {
      return await new Promise<StoredAssetRecord[]>((resolve, reject) => {
        const records: StoredAssetRecord[] = [];
        const request = store.openCursor();

        request.onsuccess = () => {
          const cursor = request.result as IDBCursorWithValue | null;
          if (!cursor) {
            resolve(records);
            return;
          }

          const value = cursor.value as StoredAssetRecord | undefined;
          if (value && typeof value.id === 'string') {
            records.push(value);
          }
          cursor.continue();
        };

        request.onerror = () => {
          reject(request.error ?? new Error('Failed to iterate asset records'));
        };
      });
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

  await runTransaction('readwrite', async (store) => {
    await Promise.all(
      records.map(
        (record) =>
          new Promise<void>((resolve, reject) => {
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error ?? new Error('Failed to store asset record'));
          })
      )
    );
    return undefined;
  });
}
