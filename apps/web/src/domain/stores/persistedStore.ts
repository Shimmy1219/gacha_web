import type { AppPersistence } from '../app-persistence';

export type PersistMode = 'immediate' | 'debounced' | 'none';

export interface UpdateOptions {
  persist?: PersistMode;
  emit?: boolean;
}

export type StoreListener<T> = (state: T | undefined) => void;

export abstract class PersistedStore<T> {
  protected state: T | undefined;

  private hydrated = false;

  private readonly listeners = new Set<StoreListener<T>>();

  protected constructor(protected readonly persistence: AppPersistence) {}

  hydrate(initialState: T | undefined): void {
    this.state = initialState;
    this.hydrated = true;
    this.notify();
  }

  getState(): T | undefined {
    return this.state;
  }

  isHydrated(): boolean {
    return this.hydrated;
  }

  setState(nextState: T | undefined, options: UpdateOptions = {}): T | undefined {
    return this.commit(nextState, options);
  }

  update(
    updater: (previous: T | undefined) => T | undefined,
    options: UpdateOptions = {}
  ): T | undefined {
    const nextState = updater(this.state);
    return this.commit(nextState, options);
  }

  subscribe(listener: StoreListener<T>): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  save(): void {
    this.persistImmediate(this.state);
  }

  saveDebounced(): void {
    this.persistDebounced(this.state);
  }

  protected commit(nextState: T | undefined, options: UpdateOptions): T | undefined {
    const changed = !Object.is(this.state, nextState);
    this.state = nextState;

    if (changed && options.emit !== false) {
      this.notify();
    } else if (!changed && options.emit === true) {
      this.notify();
    }

    const mode = options.persist ?? 'none';
    if (mode === 'immediate') {
      this.persistImmediate(nextState);
    } else if (mode === 'debounced') {
      this.persistDebounced(nextState);
    }

    return nextState;
  }

  protected notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  protected abstract persistImmediate(state: T | undefined): void;

  protected abstract persistDebounced(state: T | undefined): void;
}
