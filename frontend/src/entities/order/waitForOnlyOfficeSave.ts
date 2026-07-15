import type { OnlyOfficeForceSaveResponse, OnlyOfficeSaveStatusResponse } from "./onlyofficeTypes"

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

export type WaitOnlyOfficeSaveResult = "persisted" | "no_changes"

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
  const forceResult = await params.forceSave(saveId)

  if (forceResult.message === "no_changes") {
    return "no_changes"
  }

  const trackedId = forceResult.save_id ?? saveId
  const pollIntervalMs = params.pollIntervalMs ?? 400
  const timeoutMs = params.timeoutMs ?? 20_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const status = await params.getStatus(trackedId)
    if (status.state === "persisted") return "persisted"
    if (status.state === "no_changes") return "no_changes"
    if (status.state === "failed") {
      throw new Error(status.error || "Ошибка сохранения документа OnlyOffice")
    }
    await sleep(pollIntervalMs)
  }

  throw new Error("Таймаут ожидания сохранения документа. Повторите попытку.")
}
