import axios from "axios"
import type { OnlyOfficeForceSaveResponse, OnlyOfficeSaveStatusResponse } from "./onlyofficeTypes"

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

export type WaitOnlyOfficeSaveResult = "persisted" | "no_changes"

function formatSaveError(err: unknown, phase: "forcesave" | "save-status"): Error {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const detail =
      (err.response?.data as { detail?: string; message?: string } | undefined)?.detail ||
      (err.response?.data as { message?: string } | undefined)?.message
    const url = err.config?.url ?? ""

    if (status === 404) {
      return new Error(
        phase === "save-status"
          ? "API save-status не найден (404). Перезапустите backend на ветке feature/order-onlyoffice-save-reliability и обновите страницу."
          : `Не найден ресурс forcesave (404)${url ? `: ${url}` : ""}. Проверьте, что backend запущен с актуальным кодом.`
      )
    }
    if (status === 502 || status === 503) {
      return new Error(
        detail ||
          "OnlyOffice недоступен или не принял команду сохранения. Проверьте Document Server и повторите."
      )
    }
    if (status === 422) {
      return new Error(detail || "Неверный ключ документа OnlyOffice. Обновите страницу редактора.")
    }
    if (detail) return new Error(String(detail))
    if (status) return new Error(`Ошибка сохранения (HTTP ${status})`)
  }
  if (err instanceof Error) return err
  return new Error("Не удалось сохранить документ")
}

/**
 * Request forcesave with save_id and poll until file is persisted (or no_changes / fail / timeout).
 */
export async function requestAndWaitOnlyOfficeSave(params: {
  forceSave: (saveId: string) => Promise<OnlyOfficeForceSaveResponse>
  getStatus: (saveId: string) => Promise<OnlyOfficeSaveStatusResponse>
  pollIntervalMs?: number
  timeoutMs?: number
}): Promise<WaitOnlyOfficeSaveResult> {
  const saveId = crypto.randomUUID()

  let forceResult: OnlyOfficeForceSaveResponse
  try {
    forceResult = await params.forceSave(saveId)
  } catch (err) {
    throw formatSaveError(err, "forcesave")
  }

  if (forceResult.message === "no_changes") {
    return "no_changes"
  }

  // Old backend ignores save_id and has no save-status — fail fast with clear message.
  if (forceResult.save_id == null && forceResult.message === "save_requested") {
    // Still try poll with client saveId (new backend echoes save_id; old has no endpoint).
  }

  const trackedId = forceResult.save_id ?? saveId
  const pollIntervalMs = params.pollIntervalMs ?? 400
  const timeoutMs = params.timeoutMs ?? 20_000
  const deadline = Date.now() + timeoutMs
  let sawUnknownOnly = true

  while (Date.now() < deadline) {
    let status: OnlyOfficeSaveStatusResponse
    try {
      status = await params.getStatus(trackedId)
    } catch (err) {
      throw formatSaveError(err, "save-status")
    }

    if (status.state === "persisted") return "persisted"
    if (status.state === "no_changes") return "no_changes"
    if (status.state === "failed") {
      throw new Error(status.error || "Ошибка сохранения документа OnlyOffice")
    }
    if (status.state === "pending") sawUnknownOnly = false
    // unknown: attempt not registered (wrong worker / old backend / expired) — keep polling briefly
    await sleep(pollIntervalMs)
  }

  if (sawUnknownOnly) {
    throw new Error(
      "Статус сохранения так и не появился (state=unknown). Обычно это старый backend без save-status или несколько воркеров без общего tracker. Перезапустите backend с ветки feature/order-onlyoffice-save-reliability (один процесс) и повторите."
    )
  }

  throw new Error("Таймаут ожидания сохранения документа. Повторите попытку.")
}
