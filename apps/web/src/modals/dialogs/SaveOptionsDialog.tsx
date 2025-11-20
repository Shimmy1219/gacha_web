import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  FolderArrowDownIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { GachaLocalStorageSnapshot, PullHistoryEntryV1 } from '@domain/app-persistence';
import { getPullHistoryStatusLabel } from '@domain/pullHistoryStatusLabels';

import { useStoreValue } from '@domain/stores';
import { buildUserZipFromSelection } from '../../features/save/buildUserZip';
import { useBlobUpload } from '../../features/save/useBlobUpload';
import type { SaveTargetSelection } from '../../features/save/types';
import { useDiscordSession } from '../../features/discord/useDiscordSession';
import {
  DiscordGuildSelectionMissingError,
  requireDiscordGuildSelection
} from '../../features/discord/discordGuildSelectionStorage';
import { useAppPersistence, useDomainStores } from '../../features/storage/AppPersistenceProvider';
import { ModalBody, ModalFooter, type ModalComponentProps } from '..';
import { openDiscordShareDialog } from '../../features/discord/openDiscordShareDialog';
import { linkDiscordProfileToStore } from '../../features/discord/linkDiscordProfileToStore';
import { ensurePrivateChannelCategory } from '../../features/discord/ensurePrivateChannelCategory';

export interface SaveOptionsUploadResult {
  url: string;
  label?: string;
  expiresAt?: string;
}

export interface SaveOptionsDialogPayload {
  userId: string;
  userName: string;
  snapshot: GachaLocalStorageSnapshot;
  selection: SaveTargetSelection;
}

interface LastDownloadState {
  fileName: string;
  fileCount: number;
  warnings: string[];
  savedAt: string;
}

function formatExpiresAt(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function formatHistoryEntry(entry: PullHistoryEntryV1 | undefined, gachaName: string): string {
  if (!entry) {
    return `${gachaName}: 履歴情報なし`;
  }
  const executedAt = formatExpiresAt(entry.executedAt) ?? '日時不明';
  const pullCount = Number.isFinite(entry.pullCount) ? `${entry.pullCount}連` : '回数不明';
  const statusLabel = getPullHistoryStatusLabel(entry.status);
  return `${executedAt} / ${gachaName} (${pullCount})${statusLabel ? ` / ${statusLabel}` : ''}`;
}

export function SaveOptionsDialog({ payload, close, push }: ModalComponentProps<SaveOptionsDialogPayload>): JSX.Element {
  const { userId, userName, snapshot, selection } = payload;
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDiscordSharing, setIsDiscordSharing] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [lastDownload, setLastDownload] = useState<LastDownloadState | null>(null);
  const [uploadNotice, setUploadNotice] = useState<{ id: number; message: string } | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticePortalRef = useRef<HTMLDivElement | null>(null);

  const { uploadZip } = useBlobUpload();
  const persistence = useAppPersistence();
  const { userProfiles: userProfilesStore } = useDomainStores();
  const userProfilesState = useStoreValue(userProfilesStore);
  const { pullHistory: pullHistoryStore } = useDomainStores();
  const { data: discordSession } = useDiscordSession();
  const discordUserId = discordSession?.user?.id;

  const resolvePullIdsForStatus = useCallback(
    (zipPullIds: string[]): string[] => {
      if (selection.mode !== 'history') {
        return zipPullIds;
      }
      const merged = new Set<string>(selection.pullIds);
      zipPullIds.forEach((id) => merged.add(id));
      return Array.from(merged);
    },
    [selection]
  );

  const receiverDisplayName = useMemo(() => {
    const profileName = snapshot.userProfiles?.users?.[userId]?.displayName;
    const candidates = [profileName, userName, userId];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return userId;
  }, [snapshot.userProfiles?.users, userId, userName]);

  const linkDiscordProfile = useCallback(
    (params: {
      discordUserId: string;
      discordDisplayName?: string | null;
      discordUserName?: string | null;
      avatarUrl?: string | null;
      share?: {
        channelId?: string;
        channelName?: string | null;
        channelParentId?: string | null;
        shareUrl?: string;
        shareLabel?: string | null;
        shareTitle?: string | null;
        shareComment?: string | null;
        sharedAt?: string;
      };
    }) =>
      linkDiscordProfileToStore({
        store: userProfilesStore,
        profileId: userId,
        discordUserId: params.discordUserId,
        discordDisplayName: params.discordDisplayName ?? receiverDisplayName,
        discordUserName: params.discordUserName,
        avatarUrl: params.avatarUrl,
        share: params.share
      }),
    [receiverDisplayName, userId, userProfilesStore]
  );

  const storedUpload: SaveOptionsUploadResult | null = useMemo(() => {
    const saved = snapshot.saveOptions?.[userId];
    if (!saved) {
      return null;
    }
    const url = saved.shareUrl ?? saved.downloadUrl;
    if (!url) {
      return null;
    }
    return {
      url,
      label: saved.shareUrl ?? url,
      expiresAt: formatExpiresAt(saved.expiresAt)
    };
  }, [snapshot.saveOptions, userId]);

  const [uploadResult, setUploadResult] = useState<SaveOptionsUploadResult | null>(storedUpload);

  useEffect(() => {
    setUploadResult(storedUpload);
  }, [storedUpload]);

  useEffect(() => {
    setCopied(false);
  }, [uploadResult?.url]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }
      if (noticePortalRef.current?.parentNode) {
        noticePortalRef.current.parentNode.removeChild(noticePortalRef.current);
        noticePortalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!uploadNotice) {
      return;
    }
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = setTimeout(() => {
      setUploadNotice(null);
    }, 4000);
  }, [uploadNotice?.id]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const root = document.getElementById('modal-root');
    if (!root) {
      return;
    }
    const container = document.createElement('div');
    root.appendChild(container);
    noticePortalRef.current = container;
    return () => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      if (noticePortalRef.current === container) {
        noticePortalRef.current = null;
      }
    };
  }, []);

  const gachaNameMap = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(snapshot.appState?.meta ?? {}).forEach(([gachaId, meta]) => {
      if (gachaId) {
        map.set(gachaId, meta.displayName ?? gachaId);
      }
    });
    return map;
  }, [snapshot.appState?.meta]);

  const selectionSummary = useMemo(() => {
    if (selection.mode === 'all') {
      const gachaCount = Object.keys(snapshot.userInventories?.inventories?.[userId] ?? {}).length;
      return {
        description: '全てのガチャ景品をまとめて保存します。',
        details: [`保存対象ガチャ数: ${gachaCount}`]
      };
    }
    if (selection.mode === 'gacha') {
      const names = selection.gachaIds.map((id) => gachaNameMap.get(id) ?? id);
      return {
        description: `選択したガチャ ${selection.gachaIds.length} 件を保存します。`,
        details: names
      };
    }
    const history = snapshot.pullHistory?.pulls ?? {};
    const details = selection.pullIds.map((pullId) => {
      const entry = history[pullId];
      const gachaName = entry?.gachaId ? gachaNameMap.get(entry.gachaId) ?? entry.gachaId : 'ガチャ不明';
      return formatHistoryEntry(entry, gachaName);
    });
    return {
      description: `選択した履歴 ${selection.pullIds.length} 件に含まれる景品を保存します。`,
      details
    };
  }, [selection, snapshot.userInventories?.inventories, snapshot.pullHistory?.pulls, gachaNameMap, userId]);

  const handleCopyUrl = async (url: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch (error) {
      console.warn('クリップボードへのコピーに失敗しました', error);
    }
  };

  const handleSaveToDevice = async () => {
    if (isProcessing) {
      return;
    }
    setIsProcessing(true);
    setErrorBanner(null);
    try {
      const result = await buildUserZipFromSelection({
        snapshot,
        selection,
        userId,
        userName: receiverDisplayName
      });

      const pullIdsForStatus = resolvePullIdsForStatus(result.pullIds);
      if (pullIdsForStatus.length > 0) {
        pullHistoryStore.markPullStatus(pullIdsForStatus, 'ziped');
      }

      const blobUrl = window.URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(blobUrl);

      setLastDownload({
        fileName: result.fileName,
        fileCount: result.fileCount,
        warnings: result.warnings,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('ZIPの作成に失敗しました', error);
      const message = error instanceof Error ? error.message : String(error);
      setErrorBanner(`ZIPの作成に失敗しました: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const runZipUpload = useCallback(async () => {
    const zip = await buildUserZipFromSelection({
      snapshot,
      selection,
      userId,
      userName: receiverDisplayName
    });

    const uploadResponse = await uploadZip({
      file: zip.blob,
      fileName: zip.fileName,
      userId,
      receiverName: receiverDisplayName,
      ownerDiscordId: discordSession?.user?.id,
      ownerDiscordName: discordSession?.user?.name
    });

    const expiresAtDisplay = uploadResponse.expiresAt
      ? formatExpiresAt(uploadResponse.expiresAt) ?? uploadResponse.expiresAt
      : undefined;

    const savedAt = new Date().toISOString();

    persistence.savePartial({
      saveOptions: {
        [userId]: {
          version: 3,
          key: uploadResponse.token,
          shareUrl: uploadResponse.shareUrl,
          downloadUrl: uploadResponse.downloadUrl,
          expiresAt: uploadResponse.expiresAt,
          pathname: uploadResponse.pathname,
          savedAt
        }
      }
    });

    const result: SaveOptionsUploadResult = {
      url: uploadResponse.shareUrl,
      label: uploadResponse.shareUrl,
      expiresAt: expiresAtDisplay
    };

    setUploadResult(result);

    return { uploadResponse, result };
  }, [
    discordSession?.user?.id,
    discordSession?.user?.name,
    persistence,
    receiverDisplayName,
    selection,
    snapshot,
    uploadZip,
    userId
  ]);

  const handleUploadToShimmy = async () => {
    if (isProcessing || isUploading || isDiscordSharing) {
      return;
    }
    setIsUploading(true);
    setErrorBanner(null);
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setUploadNotice(null);
    setUploadResult(null);
    persistence.savePartial({
      saveOptions: {
        [userId]: null
      }
    });
    try {
      await runZipUpload();
      const zip = await buildUserZipFromSelection({
        snapshot,
        selection,
        userId,
        userName: receiverDisplayName
      });

      const pullIdsForStatus = resolvePullIdsForStatus(zip.pullIds);
      if (pullIdsForStatus.length > 0) {
        pullHistoryStore.markPullStatus(pullIdsForStatus, 'ziped');
      }

      const uploadResponse = await uploadZip({
        file: zip.blob,
        fileName: zip.fileName,
        userId,
        receiverName: receiverDisplayName,
        ownerDiscordId: discordSession?.user?.id,
        ownerDiscordName: discordSession?.user?.name
      });

      const expiresAtDisplay = uploadResponse.expiresAt
        ? formatExpiresAt(uploadResponse.expiresAt) ?? uploadResponse.expiresAt
        : undefined;

      const savedAt = new Date().toISOString();

      persistence.savePartial({
        saveOptions: {
          [userId]: {
            version: 3,
            key: uploadResponse.token,
            shareUrl: uploadResponse.shareUrl,
            downloadUrl: uploadResponse.downloadUrl,
            expiresAt: uploadResponse.expiresAt,
            pathname: uploadResponse.pathname,
            savedAt
          }
        }
      });

      setUploadResult({
        url: uploadResponse.shareUrl,
        label: uploadResponse.shareUrl,
        expiresAt: expiresAtDisplay
      });
      if (pullIdsForStatus.length > 0) {
        pullHistoryStore.markPullStatus(pullIdsForStatus, 'uploaded');
      }
      setUploadNotice({ id: Date.now(), message: 'アップロードが完了しました' });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.info('ZIPアップロードがユーザーによってキャンセルされました');
        return;
      }
      console.error('ZIPアップロード処理に失敗しました', error);
      const message = error instanceof Error ? error.message : String(error);
      setErrorBanner(`アップロードに失敗しました: ${message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const isDiscordLoggedIn = discordSession?.loggedIn === true;
  const discordHelperText = isDiscordLoggedIn ? 'Discordに共有' : 'ログインが必要';

  const handleShareToDiscord = async () => {
    setErrorBanner(null);
    if (!isDiscordLoggedIn) {
      setErrorBanner('Discordにログインしてから共有してください。');
      return;
    }
    if (!discordUserId) {
      setErrorBanner('Discordアカウントの情報を取得できませんでした。再度ログインしてください。');
      return;
    }
    if (isProcessing || isUploading || isDiscordSharing) {
      return;
    }

    setIsDiscordSharing(true);
    setUploadResult(null);
    persistence.savePartial({
      saveOptions: {
        [userId]: null
      }
    });

    let uploadData: SaveOptionsUploadResult | null = null;

    try {
      const { result } = await runZipUpload();
      uploadData = result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.info('Discord共有用ZIPアップロードがキャンセルされました');
      } else {
        console.error('Discord共有用ZIPの生成またはアップロードに失敗しました', error);
        const message = error instanceof Error ? error.message : String(error);
        setErrorBanner(`Discord共有の準備に失敗しました: ${message}`);
      }
      setIsDiscordSharing(false);
      return;
    }

    if (!uploadData?.url) {
      setErrorBanner('Discord共有に必要なURLを取得できませんでした。再度お試しください。');
      setIsDiscordSharing(false);
      return;
    }

    const pickProfile = () => {
      const latestStoreProfile = userProfilesState?.users?.[userId];
      if (latestStoreProfile) {
        return latestStoreProfile;
      }
      const snapshotProfile = snapshot.userProfiles?.users?.[userId];
      if (snapshotProfile) {
        return snapshotProfile;
      }
      const persistedSnapshot = persistence.loadSnapshot();
      return persistedSnapshot.userProfiles?.users?.[userId];
    };

    const profile = pickProfile();

    const trimOrNull = (value: string | null | undefined): string | null => {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    };

    const sharedMemberId = trimOrNull(profile?.discordUserId);

    if (sharedMemberId) {
      try {
        const guildSelection = requireDiscordGuildSelection(discordUserId);

        const pickDisplayName = (
          ...candidates: Array<string | null | undefined>
        ): string => {
          for (const candidate of candidates) {
            if (typeof candidate === 'string') {
              const trimmed = candidate.trim();
              if (trimmed) {
                return trimmed;
              }
            }
          }
          return sharedMemberId;
        };

        const memberDisplayName = pickDisplayName(
          profile?.discordDisplayName,
          receiverDisplayName,
          profile?.displayName,
          profile?.discordUserName,
          profile?.id
        );

        let channelId = trimOrNull(profile?.discordLastShareChannelId);
        const storedChannelName = profile?.discordLastShareChannelName;
        let channelName =
          storedChannelName === null ? null : trimOrNull(storedChannelName ?? undefined);
        const storedParentId = profile?.discordLastShareChannelParentId;
        let channelParentId =
          storedParentId === null ? null : trimOrNull(storedParentId ?? undefined);

        const shareUrl = uploadData.url;
        const shareLabelCandidate = uploadData.label ?? shareUrl;
        const shareTitle = `${receiverDisplayName ?? '景品'}のお渡しリンクです`;
        const shareComment =
          shareLabelCandidate && shareLabelCandidate !== shareUrl ? shareLabelCandidate : null;

        let preferredCategory = channelParentId ?? guildSelection.privateChannelCategory?.id ?? null;

        if (!channelId && !preferredCategory) {
          const category = await ensurePrivateChannelCategory({
            push,
            discordUserId,
            guildSelection,
            dialogTitle: 'お渡しカテゴリの設定'
          });
          preferredCategory = category.id;
        }

        if (!channelId) {
          if (!preferredCategory) {
            throw new Error(
              'お渡しチャンネルのカテゴリが設定されていません。Discord共有設定を確認してください。'
            );
          }

          const params = new URLSearchParams({
            guild_id: guildSelection.guildId,
            member_id: sharedMemberId,
            category_id: preferredCategory
          });
          const findResponse = await fetch(`/api/discord/find-channels?${params.toString()}`, {
            method: 'GET',
            headers: {
              Accept: 'application/json'
            },
            credentials: 'include'
          });

          const findPayload = (await findResponse.json().catch(() => null)) as {
            ok: boolean;
            channel_id?: string | null;
            channel_name?: string | null;
            parent_id?: string | null;
            created?: boolean;
            error?: string;
          } | null;

          if (!findResponse.ok || !findPayload) {
            const message =
              findPayload?.error || `お渡しチャンネルの確認に失敗しました (${findResponse.status})`;
            throw new Error(message);
          }

          if (!findPayload.ok) {
            throw new Error(findPayload.error || 'お渡しチャンネルの確認に失敗しました');
          }

          channelId = trimOrNull(findPayload.channel_id);
          channelName =
            findPayload.channel_name === null
              ? null
              : trimOrNull(findPayload.channel_name ?? undefined);
          channelParentId =
            findPayload.parent_id === null
              ? null
              : trimOrNull(findPayload.parent_id ?? undefined);
        }

        if (!channelId) {
          throw new Error('お渡しチャンネルの情報が見つかりませんでした。');
        }

        const payload: Record<string, unknown> = {
          channel_id: channelId,
          share_url: shareUrl,
          title: shareTitle,
          mode: 'bot'
        };
        if (shareComment) {
          payload.comment = shareComment;
        }

        const sendResponse = await fetch('/api/discord/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(payload)
        });

        const sendPayload = (await sendResponse
          .json()
          .catch(() => ({ ok: false, error: 'unexpected response' }))) as {
          ok?: boolean;
          error?: string;
        };

        if (!sendResponse.ok || !sendPayload.ok) {
          throw new Error(sendPayload.error || 'Discordへの共有に失敗しました');
        }

        const sharedAt = new Date().toISOString();
        const rawShareUrl = shareUrl || '';
        const resolvedShareUrl = rawShareUrl.trim();
        const resolvedShareLabel =
          typeof shareLabelCandidate === 'string' ? shareLabelCandidate.trim() : null;

        const shareInfo = resolvedShareUrl
          ? {
              channelId,
              channelName: channelName ?? null,
              channelParentId: channelParentId ?? null,
              shareUrl: resolvedShareUrl,
              shareLabel: resolvedShareLabel ? resolvedShareLabel : null,
              shareTitle,
              shareComment: shareComment ?? null,
              sharedAt
            }
          : undefined;

        void linkDiscordProfile({
          discordUserId: sharedMemberId,
          discordDisplayName: memberDisplayName,
          discordUserName: profile?.discordUserName,
          avatarUrl: profile?.discordAvatarUrl ?? undefined,
          share: shareInfo
        });

        setErrorBanner(null);
        setUploadNotice({
          id: Date.now(),
          message: `${memberDisplayName}さんにDiscordで共有しました`
        });
      } catch (error) {
        const message =
          error instanceof DiscordGuildSelectionMissingError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        const displayMessage =
          error instanceof DiscordGuildSelectionMissingError
            ? message
            : `Discord共有の送信に失敗しました: ${message}`;
        setErrorBanner(displayMessage);
      }
      setIsDiscordSharing(false);
      return;
    }

    try {
      openDiscordShareDialog({
        push,
        discordUserId,
        shareUrl: uploadData.url,
        shareLabel: uploadData.label,
        receiverName: receiverDisplayName,
        onShared: ({
          memberId: sharedMemberId,
          memberName,
          memberDisplayName,
          memberUsername,
          memberAvatarHash,
          memberAvatarUrl,
          channelId,
          channelName,
          channelParentId,
          shareUrl: sharedUrl,
          shareLabel,
          shareTitle,
          shareComment,
          sharedAt
        }) => {
          setErrorBanner(null);
          const resolvedAvatarUrl = sharedMemberId && memberAvatarHash
            ? `https://cdn.discordapp.com/avatars/${sharedMemberId}/${memberAvatarHash}.png?size=256`
            : memberAvatarUrl ?? null;
          const rawShareUrl = sharedUrl || uploadData?.url || '';
          const resolvedShareUrl = rawShareUrl.trim();
          const resolvedShareLabelRaw =
            shareLabel ?? uploadData?.label ?? (sharedUrl && sharedUrl !== rawShareUrl ? sharedUrl : null);
          const resolvedShareLabel =
            typeof resolvedShareLabelRaw === 'string' ? resolvedShareLabelRaw.trim() : resolvedShareLabelRaw;
          const shareInfo = resolvedShareUrl
            ? {
                channelId,
                channelName: channelName ?? null,
                channelParentId: channelParentId ?? null,
                shareUrl: resolvedShareUrl,
                shareLabel: resolvedShareLabel ? resolvedShareLabel : null,
                shareTitle: shareTitle ?? null,
                shareComment: shareComment ?? null,
                sharedAt: sharedAt ?? new Date().toISOString()
              }
            : undefined;

          void linkDiscordProfile({
            discordUserId: sharedMemberId,
            discordDisplayName: memberDisplayName ?? memberName,
            discordUserName: memberUsername,
            avatarUrl: resolvedAvatarUrl,
            share: shareInfo
          });
          setUploadNotice({
            id: Date.now(),
            message: `${memberName}さんにDiscordで共有しました`
          });
        },
        onShareFailed: (message) => {
          setErrorBanner(message);
        }
      });
    } catch (error) {
      const message =
        error instanceof DiscordGuildSelectionMissingError
          ? error.message
          : 'Discordギルドの選択情報を取得できませんでした。Discord共有設定を確認してください。';
      setErrorBanner(message);
    } finally {
      setIsDiscordSharing(false);
    }
  };

  const uploadNoticePortal =
    uploadNotice && noticePortalRef.current
      ? createPortal(
          <div className="pointer-events-none fixed inset-x-0 top-10 z-[120] flex justify-center">
            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-emerald-500/50 bg-white/95 px-5 py-2 text-sm font-medium text-black shadow-lg shadow-emerald-900/10">
              <CheckCircleIcon className="h-5 w-5 text-emerald-500" />
              <span className="text-black">{uploadNotice.message}</span>
            </div>
          </div>,
          noticePortalRef.current
        )
      : null;

  return (
    <>
      {uploadNoticePortal}
      <ModalBody className="space-y-6">
        <div className="space-y-3 rounded-2xl border border-border/60 bg-surface/30 p-4 text-sm">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">保存対象の概要</div>
          <div className="text-sm text-surface-foreground">{selectionSummary.description}</div>
          {selectionSummary.details.length > 0 ? (
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
              {selectionSummary.details.map((line, index) => (
                <li key={`${line}-${index}`}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SaveOptionCard
            title="デバイスに保存"
            busyTitle="生成中…"
            description="端末にZIPを保存し、後からお好みのサービスにアップロードして共有します。"
            icon={<FolderArrowDownIcon className="h-6 w-6" />}
            onClick={handleSaveToDevice}
            disabled={isUploading}
            isBusy={isProcessing}
            helperText="デバイスに保存"
          />
          <SaveOptionCard
            title="zipファイルをアップロード"
            busyTitle="アップロード中…"
            description="ZIPをshimmy3.comにアップロードし、受け取り用の共有リンクを発行します。"
            icon={<ArrowUpTrayIcon className="h-6 w-6" />}
            onClick={handleUploadToShimmy}
            disabled={isProcessing}
            isBusy={isUploading}
            helperText="zipファイルをアップロード"
          />
          <SaveOptionCard
            title="Discordで共有"
            description="保存した共有リンクをDiscordのお渡しチャンネルに送信します。先に共有URLを発行してからご利用ください。"
            disabled={isProcessing || isUploading || isDiscordSharing}
            icon={<PaperAirplaneIcon className="h-6 w-6" />}
            onClick={handleShareToDiscord}
            isBusy={isDiscordSharing}
            busyTitle="共有準備中…"
            helperText={isDiscordSharing ? undefined : discordHelperText}
          />
        </div>

        {uploadResult ? (
          <div className="space-y-2 rounded-2xl border border-border/60 bg-surface/30 p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-surface-foreground">
              <DocumentDuplicateIcon className="h-5 w-5 text-accent" />
              直近の共有リンク
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),auto] sm:items-center">
              <a
                href={uploadResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate rounded-xl border border-border/60 bg-surface-alt px-3 py-2 font-mono text-xs text-surface-foreground"
              >
                {uploadResult.label ?? uploadResult.url}
              </a>
              <button type="button" className="btn btn-muted" onClick={() => handleCopyUrl(uploadResult.url)}>
                {copied ? 'コピーしました' : 'URLをコピー'}
              </button>
            </div>
            {uploadResult.expiresAt ? (
              <p className="text-[11px] text-muted-foreground">有効期限: {uploadResult.expiresAt}</p>
            ) : null}
          </div>
        ) : null}

        {errorBanner ? (
          <div className="rounded-2xl border border-rose-500/70 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {errorBanner}
          </div>
        ) : null}

        {lastDownload ? (
          <div className="space-y-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-surface-foreground">
            <div className="flex items-center gap-2 text-sm font-semibold text-surface-foreground">
              <CheckCircleIcon className="h-5 w-5 text-emerald-500" />
              端末への保存が完了しました
            </div>
            <p>ファイル名: {lastDownload.fileName}</p>
            <p>収録件数: {lastDownload.fileCount} 件</p>
            <p>保存日時: {formatExpiresAt(lastDownload.savedAt) ?? lastDownload.savedAt}</p>
            {lastDownload.warnings.length > 0 ? (
              <div className="space-y-1">
                <p className="font-semibold">警告:</p>
                <ul className="list-inside list-disc space-y-1">
                  {lastDownload.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-muted" onClick={close}>
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}

interface SaveOptionCardProps {
  title: string;
  description: string;
  icon: JSX.Element;
  onClick: () => void;
  disabled?: boolean;
  isBusy?: boolean;
  busyTitle?: string;
  helperText?: string;
}

function SaveOptionCard({
  title,
  description,
  icon,
  onClick,
  disabled,
  isBusy = false,
  busyTitle,
  helperText
}: SaveOptionCardProps): JSX.Element {
  const isDisabled = Boolean(disabled) || isBusy;
  const displayTitle = isBusy && busyTitle ? busyTitle : title;
  const displayHelperText = isBusy ? undefined : helperText;
  const displayIcon = isBusy ? <ArrowPathIcon className="h-6 w-6 animate-spin" /> : icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={isBusy}
      className={
        `save-options__card flex h-full flex-col gap-4 rounded-2xl border border-border/70 bg-surface/30 p-5 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
          isDisabled
            ? 'cursor-not-allowed opacity-60'
            : 'hover:border-accent hover:bg-accent/10'
        }`
      }
    >
      <div className="flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-surface text-accent">
          {displayIcon}
        </div>
        <h3 className="text-base font-semibold text-surface-foreground">{displayTitle}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      {displayHelperText ? (
        <div className="mt-auto text-sm font-medium text-accent">{displayHelperText}</div>
      ) : null}
    </button>
  );
}
