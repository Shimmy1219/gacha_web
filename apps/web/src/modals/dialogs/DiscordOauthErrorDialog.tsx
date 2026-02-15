import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useMemo } from 'react';

import { ModalBody, ModalFooter, type ModalComponentProps } from '..';

export interface DiscordOauthErrorDialogPayload {
  oauthError: string;
}

const REPORT_PROFILE_URL = 'https://x.com/shiyura43_';

export function DiscordOauthErrorDialog({
  payload,
  close
}: ModalComponentProps<DiscordOauthErrorDialogPayload>): JSX.Element {
  const { oauthError, errorName } = useMemo(() => {
    const normalizedError =
      typeof payload?.oauthError === 'string' && payload.oauthError.length > 0
        ? payload.oauthError
        : 'unknown_error';

    return {
      oauthError: normalizedError,
      errorName: `OAuth error: ${normalizedError}`
    };
  }, [payload?.oauthError]);

  return (
    <>
      <ModalBody className="discord-oauth-error-dialog__body space-y-4 text-sm leading-relaxed">
        <div className="discord-oauth-error-dialog__panel flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-700">
          <ExclamationTriangleIcon
            className="discord-oauth-error-dialog__icon mt-0.5 h-5 w-5 shrink-0 text-amber-500"
            aria-hidden="true"
          />
          <div className="discord-oauth-error-dialog__content space-y-3">
            <p className="discord-oauth-error-dialog__message">
              認証画面でキャンセルを押しましたか？Discordとの連携が無くても、基本的な機能は引き続き使用できます！
            </p>
            <p className="discord-oauth-error-dialog__message">
              もし、あなたが「キャンセル」を押していない場合はこれはバグですので、
              <a
                className="discord-oauth-error-dialog__report-link font-semibold underline underline-offset-4 hover:opacity-90"
                href={REPORT_PROFILE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                @shiyura43_
              </a>{' '}
              に報告してください。
            </p>
            <p className="discord-oauth-error-dialog__error-name">
              エラー名：
              <code className="discord-oauth-error-dialog__error-code ml-2 rounded bg-black/10 px-2 py-0.5 text-[0.85em] text-amber-900">
                {errorName}
              </code>
            </p>
          </div>
        </div>
        <div className="discord-oauth-error-dialog__meta hidden" data-oauth-error={oauthError} />
      </ModalBody>
      <ModalFooter className="discord-oauth-error-dialog__footer justify-end">
        <button
          type="button"
          className="discord-oauth-error-dialog__close-button btn btn-primary"
          onClick={close}
        >
          閉じる
        </button>
      </ModalFooter>
    </>
  );
}

