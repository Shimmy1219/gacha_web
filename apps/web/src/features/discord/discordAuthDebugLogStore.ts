import { useSyncExternalStore } from 'react';

export type DiscordAuthLogLevel = 'info' | 'error';

export interface DiscordAuthLogEntry {
  id: string;
  timestamp: number;
  level: DiscordAuthLogLevel;
  message: string;
  details?: unknown;
}

const MAX_LOG_ENTRIES = 50;

let entries: DiscordAuthLogEntry[] = [];
let sequence = 0;
const subscribers = new Set<() => void>();

function shouldLog(): boolean {
  return typeof window !== 'undefined';
}

function notifySubscribers(): void {
  subscribers.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('DiscordAuthDebugLogStore listener error', error);
    }
  });
}

function addEntry(entry: DiscordAuthLogEntry): void {
  entries = [...entries.slice(-MAX_LOG_ENTRIES + 1), entry];
  notifySubscribers();
}

function normalizeDetails(details?: unknown): unknown {
  if (!details) {
    return undefined;
  }

  if (details instanceof Error) {
    return {
      name: details.name,
      message: details.message,
      stack: details.stack
    };
  }

  return details;
}

export function logDiscordAuthEvent(message: string, details?: unknown): void {
  if (!shouldLog()) {
    return;
  }

  const entry: DiscordAuthLogEntry = {
    id: `discord-auth-log-${sequence++}`,
    timestamp: Date.now(),
    level: 'info',
    message,
    details: normalizeDetails(details)
  };
  addEntry(entry);
}

export function logDiscordAuthError(message: string, details?: unknown): void {
  if (!shouldLog()) {
    return;
  }

  const entry: DiscordAuthLogEntry = {
    id: `discord-auth-log-${sequence++}`,
    timestamp: Date.now(),
    level: 'error',
    message,
    details: normalizeDetails(details)
  };
  addEntry(entry);
}

export function clearDiscordAuthLogs(): void {
  if (entries.length === 0) {
    return;
  }
  entries = [];
  notifySubscribers();
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

function getSnapshot(): DiscordAuthLogEntry[] {
  return entries;
}

function getServerSnapshot(): DiscordAuthLogEntry[] {
  return [];
}

export function useDiscordAuthLogs(): DiscordAuthLogEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
