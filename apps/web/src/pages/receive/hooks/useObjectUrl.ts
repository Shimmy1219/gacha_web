import { useEffect, useState } from 'react';

export function useObjectUrl(source?: Blob | null): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!source) {
      setUrl(undefined);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(source);
    setUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  return url;
}
