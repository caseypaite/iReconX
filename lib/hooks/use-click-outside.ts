import { RefObject, useEffect, useRef } from "react";

export function useClickOutside<T extends HTMLElement>(
  refs: RefObject<T | null> | RefObject<T | null>[],
  callback: () => void
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const targets = Array.isArray(refs) ? refs : [refs];

    function handlePointerDown(event: PointerEvent) {
      const clickedOutsideAll = targets.every(
        (ref) => ref.current && !ref.current.contains(event.target as Node)
      );
      if (clickedOutsideAll) callbackRef.current();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  // refs is stable (array of stable refs); intentionally omit callback from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
