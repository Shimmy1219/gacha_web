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
      console.error('DiscordAuthDebugLogStore listener error', error);
    }
  });
}

function addEntry(entry: DiscordAuthLogEntry): void {
  entries = [...entries.slice(-MAX_LOG_ENTRIES + 1), entry];
  notifySubscribers();
}

function normalizeDetails(details?: unknown): unknown {
  if (details === undefined || details === null) {
    return undefined;
  }

  if (details instanceof Error) {
    return {
      name: details.name,
      message: details.message,
      stack: details.stack
    };
  }

  if (Array.isArray(details)) {
    const normalizedArray = details
      .map((entry) => (entry instanceof Error ? normalizeDetails(entry) : entry))
      .filter((entry) => entry !== undefined && entry !== null);
    return normalizedArray.length > 0 ? normalizedArray : undefined;
  }

  return details;
}

type ConsoleMethodName = 'log' | 'info' | 'warn' | 'error' | 'debug';
type ConsoleMethod = (...data: unknown[]) => void;

const CONSOLE_METHODS: ConsoleMethodName[] = ['log', 'info', 'warn', 'error', 'debug'];

const globalObject = globalThis as typeof globalThis & {
  __discordAuthConsoleHooked__?: boolean;
};

function formatUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Error) {
    return value.message || value.name || 'Error';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'function') {
    return value.name ? `[Function ${value.name}]` : '[Function]';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function extractConsolePayload(args: unknown[]): { message: string; details?: unknown } | null {
  if (args.length === 0) {
    return null;
  }

  const [first, ...rest] = args;

  if (typeof first === 'string') {
    const detailsSource = rest.length > 1 ? rest : rest[0];
    return {
      message: first,
      details: normalizeDetails(detailsSource)
    };
  }

  if (first instanceof Error) {
    const detailEntries = rest.length > 0 ? [first, ...rest] : first;
    return {
      message: first.message || first.name || 'Error',
      details: normalizeDetails(detailEntries)
    };
  }

  const message = formatUnknown(first);
  const detailsSource = rest.length > 1 ? rest : rest[0];

  return {
    message,
    details: normalizeDetails(detailsSource)
  };
}

function initializeConsoleHook(): void {
  if (!shouldLog()) {
    return;
  }

  if (globalObject.__discordAuthConsoleHooked__ === true) {
    return;
  }

  CONSOLE_METHODS.forEach((method) => {
    const original = console[method];
    if (typeof original !== 'function') {
      return;
    }

    const boundOriginal = original.bind(console) as ConsoleMethod;

    (console as Record<string, ConsoleMethod>)[method] = ((...args: unknown[]) => {
      try {
        const payload = extractConsolePayload(args);
        if (payload) {
          const entry: DiscordAuthLogEntry = {
            id: `discord-auth-log-${sequence++}`,
            timestamp: Date.now(),
            level: method === 'error' || method === 'warn' ? 'error' : 'info',
            message: payload.message,
            details: payload.details
          };
          addEntry(entry);
        }
      } catch {
        // Swallow errors to avoid interfering with console output
      }

      boundOriginal(...args);
    }) as ConsoleMethod;
  });

  globalObject.__discordAuthConsoleHooked__ = true;
}

export function logDiscordAuthEvent(message: string, details?: unknown): void {
  if (!shouldLog()) {
    return;
  }

  initializeConsoleHook();

  if (details !== undefined) {
    console.info(message, details);
  } else {
    console.info(message);
  }
}

export function logDiscordAuthError(message: string, details?: unknown): void {
  if (!shouldLog()) {
    return;
  }

  initializeConsoleHook();

  if (details !== undefined) {
    console.error(message, details);
  } else {
    console.error(message);
  }
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

if (shouldLog()) {
  initializeConsoleHook();
}
