import { describe, expect, it } from 'vitest';

import {
  collectLegacyGiftChannelNameCandidates,
  evaluateChannelForLegacyGiftRepair
} from '../../../../api/discord/_lib/findChannelLegacyUtils.js';

function buildTextChannel(
  id: string,
  parentId: string | null,
  name: string,
  permissionOverwrites: Array<Record<string, unknown>>
): Record<string, unknown> {
  return {
    id,
    type: 0,
    parent_id: parentId,
    name,
    permission_overwrites: permissionOverwrites
  };
}

function buildMemberOverwrite(id: string): Record<string, unknown> {
  return {
    id,
    type: 1,
    allow: '0',
    deny: '0'
  };
}

describe('find-channels legacy repair evaluation', () => {
  it('matches a legacy candidate by normalized name in selected category', () => {
    const legacyNameCandidates = collectLegacyGiftChannelNameCandidates({
      memberId: 'member-1',
      memberDisplayNameParam: 'りな',
      expectedChannelName: 'りな'
    });

    const result = evaluateChannelForLegacyGiftRepair({
      channel: buildTextChannel('channel-1', 'category-a', '  りな  ', []),
      ownerId: 'owner-1',
      memberId: 'member-1',
      categoryId: 'category-a',
      botUserIdSet: new Set(['bot-1']),
      legacyNameCandidates
    });

    expect(result.reason).toBe('match:legacy_repair_candidate');
    expect(result.checks.nameMatched).toBe(true);
    expect(result.checks.categoryMatched).toBe(true);
  });

  it('skips a legacy candidate when conflicting member overwrites exist', () => {
    const legacyNameCandidates = collectLegacyGiftChannelNameCandidates({
      memberId: 'member-1',
      memberDisplayNameParam: 'りな',
      expectedChannelName: 'りな'
    });

    const result = evaluateChannelForLegacyGiftRepair({
      channel: buildTextChannel('channel-2', 'category-a', 'りな', [
        buildMemberOverwrite('owner-1'),
        buildMemberOverwrite('member-1'),
        buildMemberOverwrite('another-user')
      ]),
      ownerId: 'owner-1',
      memberId: 'member-1',
      categoryId: 'category-a',
      botUserIdSet: new Set(['bot-1']),
      legacyNameCandidates
    });

    expect(result.reason).toBe('skip:conflicting_member_overwrites');
    expect(result.checks.conflictingExplicitMemberIds).toEqual(['another-user']);
  });

  it('skips channels outside selected category', () => {
    const legacyNameCandidates = collectLegacyGiftChannelNameCandidates({
      memberId: 'member-1',
      memberDisplayNameParam: 'りな',
      expectedChannelName: 'りな'
    });

    const result = evaluateChannelForLegacyGiftRepair({
      channel: buildTextChannel('channel-3', 'category-b', 'りな', []),
      ownerId: 'owner-1',
      memberId: 'member-1',
      categoryId: 'category-a',
      botUserIdSet: new Set(['bot-1']),
      legacyNameCandidates
    });

    expect(result.reason).toBe('skip:category_mismatch');
    expect(result.checks.categoryMatched).toBe(false);
  });
});
