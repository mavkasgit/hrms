import { useCallback, useEffect, useRef, useState } from "react";

/** Значение по умолчанию — как у `useCopy`: секунда на галочку. */
export const COPY_RESET_DELAY_MS = 1000;

export interface UseCopyWithResetReturn {
  /** Галочка «скопировано»: встаёт только после успеха и гаснет по таймеру. */
  copied: boolean;
  /** Последнее успешно скопированное значение. */
  value?: string;
  copy: (value: string) => Promise<void>;
}

/**
 * Копирование в буфер с одним таймером сброса на хук.
 *
 * `useCopy` из пакета ставит новый `setTimeout`, не снимая предыдущий: после
 * второго клика первый таймер гасит галочку раньше своего срока. Здесь
 * `clearTimeout` вызывается перед каждым новым отсчётом, а unmount снимает
 * оставшийся таймер — иначе `setCopied` прилетит в размонтированный компонент.
 *
 * Контракт совпадает с `useCopy`: `copy` бросает при отказе, поэтому `copied`
 * не рисуется, если копирование не удалось.
 */
// TODO: убрать после фикса useCopy в @siberiacancode/reactuse (siberiacancode/reactuse#515).
export function useCopyWithReset(
  resetDelay: number = COPY_RESET_DELAY_MS,
): UseCopyWithResetReturn {
  const [copied, setCopied] = useState(false);
  const [value, setValue] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (next: string) => {
      await writeToClipboard(next);
      setValue(next);
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        setCopied(false);
      }, resetDelay);
    },
    [resetDelay],
  );

  return { copied, value, copy };
}

/**
 * `navigator.clipboard` работает только в secure context: на проде KTM по
 * HTTP на LAN-IP его нет, поэтому откат — `execCommand('copy')` со скрытой
 * textarea, как в прежнем коде кнопок.
 */
async function writeToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text); // reactuse-ok: обход бага useCopy (upstream #515)
    return;
  } catch {
    legacyCopy(text);
  }
}

function legacyCopy(text: string): void {
  if (typeof document.execCommand !== "function") {
    throw new Error("Копирование недоступно: нет ни Clipboard API, ни execCommand");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.fontSize = "16px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("document.execCommand('copy') вернул false");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}
