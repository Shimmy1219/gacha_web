export {};

declare global {
  // `process` は Edge Runtime では未定義の場合があるため、存在する場合のみ環境変数を参照する。
  // eslint-disable-next-line no-var
  var process:
    | {
        env?: Record<string, string | undefined>;
      }
    | undefined;
}
