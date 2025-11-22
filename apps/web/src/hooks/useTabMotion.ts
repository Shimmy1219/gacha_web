import { useEffect, useMemo, useRef, useState } from 'react';

type TabMotion = 'initial' | 'forward' | 'backward';

function arraysAreEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

export function useTabMotion(activeId: string | null | undefined, orderedIds: readonly string[]): TabMotion {
  const [motion, setMotion] = useState<TabMotion>('initial');
  const previousIndexRef = useRef<number>(-1);
  const previousOrderRef = useRef<readonly string[]>([]);

  const stableOrderedIds = useMemo(() => orderedIds.slice(), [orderedIds]);

  useEffect(() => {
    const orderChanged = !arraysAreEqual(previousOrderRef.current, stableOrderedIds);
    previousOrderRef.current = stableOrderedIds;

    if (stableOrderedIds.length === 0 || !activeId) {
      previousIndexRef.current = -1;
      setMotion('initial');
      return;
    }

    const nextIndex = stableOrderedIds.indexOf(activeId);
    if (nextIndex === -1) {
      previousIndexRef.current = -1;
      setMotion('initial');
      return;
    }

    if (orderChanged) {
      previousIndexRef.current = nextIndex;
      setMotion('initial');
      return;
    }

    const previousIndex = previousIndexRef.current;

    if (previousIndex === -1) {
      setMotion('initial');
    } else if (nextIndex > previousIndex) {
      setMotion('forward');
    } else if (nextIndex < previousIndex) {
      setMotion('backward');
    } else {
      setMotion('initial');
    }

    previousIndexRef.current = nextIndex;
  }, [activeId, stableOrderedIds]);

  return motion;
}
