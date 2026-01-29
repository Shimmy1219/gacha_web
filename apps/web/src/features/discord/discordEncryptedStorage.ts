export interface EncryptedRecord {
  key: string;
  ver: 1;
  alg: 'AES-GCM';
  iv: string;
  cipher: string;
  createdAt: string;
  expiresAt?: string | null;
}

export type DecryptFailureReason = 'corrupted' | 'missing-key';

export interface DecryptFailureEvent {
  key: string;
  reason: DecryptFailureReason;
}

export interface DiscordEncryptedStorage {
  initialize(): Promise<void>;
  readAll(): Promise<Map<string, string>>;
  save(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  removeByPrefix(prefix: string): Promise<void>;
  clearAll(): Promise<void>;
  onDecryptFailure(listener: (event: DecryptFailureEvent) => void): () => void;
}

interface EncryptedStorageBackend {
  getCryptoKey(): Promise<CryptoKey | null>;
  setCryptoKey(key: CryptoKey): Promise<void>;
  getAllRecords(): Promise<EncryptedRecord[]>;
  setRecord(record: EncryptedRecord): Promise<void>;
  deleteRecord(key: string): Promise<void>;
  deleteRecordsByPrefix(prefix: string): Promise<void>;
  clearRecords(): Promise<void>;
}

const DB_NAME = 'discord-secure-cache';
const DB_VERSION = 1;
const RECORD_STORE = 'records';
const KEY_STORE = 'keys';
const KEY_ID = 'discord:encryption-key:v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type BufferLike = {
  from(data: Uint8Array | string, encoding?: string): { toString(encoding: string): string };
};

const getBufferImpl = (): BufferLike | null => {
  const maybeBuffer = (globalThis as typeof globalThis & { Buffer?: BufferLike }).Buffer;
  return typeof maybeBuffer === 'undefined' ? null : maybeBuffer;
};

const toBase64 = (bytes: Uint8Array): string => {
  if (typeof btoa === 'function') {
    let binary = '';
    bytes.forEach((value) => {
      binary += String.fromCharCode(value);
    });
    return btoa(binary);
  }

  const bufferImpl = getBufferImpl();
  if (bufferImpl) {
    return bufferImpl.from(bytes).toString('base64');
  }

  throw new Error('Base64 encoder is unavailable');
};

const fromBase64 = (value: string): Uint8Array => {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  const bufferImpl = getBufferImpl();
  if (bufferImpl) {
    return new Uint8Array(bufferImpl.from(value, 'base64'));
  }

  throw new Error('Base64 decoder is unavailable');
};

const wrapRequest = <T>(request: IDBRequest<T>, message: string): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(message));
  });

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error('Failed to open discord storage'));

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORD_STORE)) {
        db.createObjectStore(RECORD_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });

class IndexedDbBackend implements EncryptedStorageBackend {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDatabase();
    }
    return this.dbPromise;
  }

  async getCryptoKey(): Promise<CryptoKey | null> {
    const db = await this.getDb();
    const tx = db.transaction(KEY_STORE, 'readonly');
    const store = tx.objectStore(KEY_STORE);
    const record = await wrapRequest<{ id: string; key: CryptoKey } | undefined | null>(
      store.get(KEY_ID),
      'Failed to read crypto key'
    );
    return record?.key ?? null;
  }

  async setCryptoKey(key: CryptoKey): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(KEY_STORE, 'readwrite');
    const store = tx.objectStore(KEY_STORE);
    await wrapRequest(store.put({ id: KEY_ID, key }), 'Failed to write crypto key');
  }

  async getAllRecords(): Promise<EncryptedRecord[]> {
    const db = await this.getDb();
    const tx = db.transaction(RECORD_STORE, 'readonly');
    const store = tx.objectStore(RECORD_STORE);
    const records = await wrapRequest(store.getAll(), 'Failed to read encrypted records');
    return Array.isArray(records) ? (records as EncryptedRecord[]) : [];
  }

  async setRecord(record: EncryptedRecord): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(RECORD_STORE, 'readwrite');
    const store = tx.objectStore(RECORD_STORE);
    await wrapRequest(store.put(record), 'Failed to write encrypted record');
  }

  async deleteRecord(key: string): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(RECORD_STORE, 'readwrite');
    const store = tx.objectStore(RECORD_STORE);
    await wrapRequest(store.delete(key), 'Failed to delete encrypted record');
  }

  async deleteRecordsByPrefix(prefix: string): Promise<void> {
    const records = await this.getAllRecords();
    const targets = records.filter((record) => record.key.startsWith(prefix));
    if (targets.length === 0) {
      return;
    }
    const db = await this.getDb();
    const tx = db.transaction(RECORD_STORE, 'readwrite');
    const store = tx.objectStore(RECORD_STORE);
    await Promise.all(targets.map((record) => wrapRequest(store.delete(record.key), 'Failed to delete record')));
  }

  async clearRecords(): Promise<void> {
    const db = await this.getDb();
    const tx = db.transaction(RECORD_STORE, 'readwrite');
    const store = tx.objectStore(RECORD_STORE);
    await wrapRequest(store.clear(), 'Failed to clear encrypted records');
  }
}

class MemoryBackend implements EncryptedStorageBackend {
  private key: CryptoKey | null = null;
  private records = new Map<string, EncryptedRecord>();

  async getCryptoKey(): Promise<CryptoKey | null> {
    return this.key;
  }

  async setCryptoKey(key: CryptoKey): Promise<void> {
    this.key = key;
  }

  async getAllRecords(): Promise<EncryptedRecord[]> {
    return Array.from(this.records.values());
  }

  async setRecord(record: EncryptedRecord): Promise<void> {
    this.records.set(record.key, record);
  }

  async deleteRecord(key: string): Promise<void> {
    this.records.delete(key);
  }

  async deleteRecordsByPrefix(prefix: string): Promise<void> {
    for (const key of Array.from(this.records.keys())) {
      if (key.startsWith(prefix)) {
        this.records.delete(key);
      }
    }
  }

  async clearRecords(): Promise<void> {
    this.records.clear();
  }
}

const createBackend = (): EncryptedStorageBackend | null => {
  if (typeof indexedDB === 'undefined') {
    return null;
  }
  return new IndexedDbBackend();
};

export const createMemoryEncryptedStorageBackend = (): EncryptedStorageBackend => new MemoryBackend();

export const createDiscordEncryptedStorage = (options?: {
  backend?: EncryptedStorageBackend | null;
  crypto?: Crypto;
}): DiscordEncryptedStorage => {
  const backend = options?.backend ?? createBackend();
  const cryptoImpl = options?.crypto ?? globalThis.crypto;
  const listeners = new Set<(event: DecryptFailureEvent) => void>();
  let initialized = false;
  let initialization: Promise<void> | null = null;

  const emitFailure = (event: DecryptFailureEvent) => {
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.warn('DiscordEncryptedStorage decrypt failure listener error', error);
      }
    });
  };

  const canEncrypt = () => Boolean(backend && cryptoImpl?.subtle && cryptoImpl.getRandomValues);

  const ensureKey = async (): Promise<{ key: CryptoKey | null; created: boolean }> => {
    if (!backend || !cryptoImpl?.subtle) {
      return { key: null, created: false };
    }

    const existing = await backend.getCryptoKey();
    if (existing) {
      return { key: existing, created: false };
    }

    const generated = await cryptoImpl.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    try {
      await backend.setCryptoKey(generated);
    } catch (error) {
      console.warn('Failed to persist discord encryption key; using in-memory key', error);
    }

    return { key: generated, created: true };
  };

  const decryptRecord = async (record: EncryptedRecord, key: CryptoKey): Promise<string> => {
    const iv = fromBase64(record.iv);
    const cipher = fromBase64(record.cipher);
    const additionalData = encoder.encode(record.key);
    const plainBuffer = await cryptoImpl.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData },
      key,
      cipher
    );
    return decoder.decode(plainBuffer);
  };

  const encryptValue = async (key: CryptoKey, storageKey: string, value: string): Promise<EncryptedRecord> => {
    const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
    const additionalData = encoder.encode(storageKey);
    const cipher = await cryptoImpl.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData },
      key,
      encoder.encode(value)
    );

    return {
      key: storageKey,
      ver: 1,
      alg: 'AES-GCM',
      iv: toBase64(iv),
      cipher: toBase64(new Uint8Array(cipher)),
      createdAt: new Date().toISOString(),
      expiresAt: null
    };
  };

  const initialize = async () => {
    if (initialized) {
      return;
    }
    if (initialization) {
      await initialization;
      return;
    }

    initialization = (async () => {
      if (!canEncrypt()) {
        initialized = true;
        return;
      }

      const { key, created } = await ensureKey();
      if (!key) {
        initialized = true;
        return;
      }

      if (created) {
        const records = await backend!.getAllRecords();
        if (records.length > 0) {
          await backend!.clearRecords();
          records.forEach((record) => emitFailure({ key: record.key, reason: 'missing-key' }));
        }
      }

      initialized = true;
    })();

    await initialization;
  };

  const readAll = async (): Promise<Map<string, string>> => {
    await initialize();
    const results = new Map<string, string>();

    if (!canEncrypt()) {
      return results;
    }

    const { key } = await ensureKey();
    if (!key) {
      return results;
    }

    const records = await backend!.getAllRecords();
    for (const record of records) {
      try {
        const value = await decryptRecord(record, key);
        results.set(record.key, value);
      } catch (error) {
        await backend!.deleteRecord(record.key);
        emitFailure({ key: record.key, reason: 'corrupted' });
      }
    }

    return results;
  };

  const save = async (storageKey: string, value: string): Promise<void> => {
    await initialize();
    if (!canEncrypt()) {
      return;
    }
    const { key } = await ensureKey();
    if (!key) {
      return;
    }
    const record = await encryptValue(key, storageKey, value);
    await backend!.setRecord(record);
  };

  const remove = async (storageKey: string): Promise<void> => {
    await initialize();
    if (!backend) {
      return;
    }
    await backend.deleteRecord(storageKey);
  };

  const removeByPrefix = async (prefix: string): Promise<void> => {
    await initialize();
    if (!backend) {
      return;
    }
    await backend.deleteRecordsByPrefix(prefix);
  };

  const clearAll = async (): Promise<void> => {
    await initialize();
    if (!backend) {
      return;
    }
    await backend.clearRecords();
  };

  return {
    initialize,
    readAll,
    save,
    remove,
    removeByPrefix,
    clearAll,
    onDecryptFailure(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
};
