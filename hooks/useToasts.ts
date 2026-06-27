"use client";

import { useCallback, useRef, useState } from "react";

export type ToastKind = "info" | "success" | "warn";

export type Toast = {
  id: number;
  message: string;
  kind: ToastKind;
};

export function useToasts(autoDismissMs = 10000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, kind }]);
      const timer = setTimeout(() => dismissToast(id), autoDismissMs);
      timersRef.current.set(id, timer);
    },
    [autoDismissMs, dismissToast]
  );

  return { toasts, pushToast, dismissToast };
}
