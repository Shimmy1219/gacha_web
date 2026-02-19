import { describe, expect, it, vi } from 'vitest';

import {
  normalizeNotificationId,
  resolveNotificationDuration,
  upsertNotificationQueue,
  type GlobalNotificationItem
} from './notificationQueue';

function item(partial: Partial<GlobalNotificationItem> & Pick<GlobalNotificationItem, 'id'>): GlobalNotificationItem {
  return {
    id: partial.id,
    message: partial.message ?? 'message',
    title: partial.title,
    variant: partial.variant ?? 'success',
    durationMs: partial.durationMs ?? 4000,
    dismissible: partial.dismissible ?? true,
    createdAt: partial.createdAt ?? 1
  };
}

describe('resolveNotificationDuration', () => {
  it('returns defaults for each variant when custom duration is missing', () => {
    expect(resolveNotificationDuration('success')).toBe(4000);
    expect(resolveNotificationDuration('warning')).toBe(5000);
    expect(resolveNotificationDuration('error')).toBe(7000);
  });

  it('returns custom duration when valid', () => {
    expect(resolveNotificationDuration('success', 1500)).toBe(1500);
    expect(resolveNotificationDuration('warning', 0)).toBe(0);
  });

  it('falls back to variant default when custom duration is invalid', () => {
    expect(resolveNotificationDuration('error', Number.NaN)).toBe(7000);
    expect(resolveNotificationDuration('warning', -1)).toBe(5000);
  });
});

describe('normalizeNotificationId', () => {
  it('uses provided id when non-empty', () => {
    expect(normalizeNotificationId(' custom-id ', 5)).toBe('custom-id');
  });

  it('generates fallback id when provided id is empty', () => {
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890);
    expect(normalizeNotificationId('   ', 7)).toBe('global-notification-1234567890-7');
    dateNowSpy.mockRestore();
  });
});

describe('upsertNotificationQueue', () => {
  it('appends a new notification in order when capacity allows', () => {
    const current = [item({ id: 'a' }), item({ id: 'b' })];
    const result = upsertNotificationQueue(current, item({ id: 'c' }), 3);

    expect(result.queue.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(result.removedIds).toEqual([]);
  });

  it('replaces existing notification when id is duplicated', () => {
    const current = [item({ id: 'a', message: 'old-a' }), item({ id: 'b' })];
    const result = upsertNotificationQueue(current, item({ id: 'a', message: 'new-a' }), 3);

    expect(result.queue.map((entry) => [entry.id, entry.message])).toEqual([
      ['b', 'message'],
      ['a', 'new-a']
    ]);
    expect(result.removedIds).toEqual(['a']);
  });

  it('drops oldest notifications when queue exceeds max visible size', () => {
    const current = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })];
    const result = upsertNotificationQueue(current, item({ id: 'd' }), 3);

    expect(result.queue.map((entry) => entry.id)).toEqual(['b', 'c', 'd']);
    expect(result.removedIds).toEqual(['a']);
  });
});
