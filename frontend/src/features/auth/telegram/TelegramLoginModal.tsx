import { useEffect, useRef, useState, useCallback } from "react"
import { Loader2, Check, X } from "lucide-react"
import QRCode from "qrcode"
import api from "@/shared/api/axios"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  startTelegramBotLogin,
  pollTelegramBotChallenge,
  translateTelegramError,
  type TelegramBotChallenge,
  type TelegramOidcConfig,
} from "@/shared/api/telegramAuth"
import { TelegramIcon } from "@/shared/ui/icons"

type TelegramLoginModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: TelegramOidcConfig | null
  onSuccess?: (data: any) => void
  inviteCode?: string
  purpose?: "login" | "link"
}

export function TelegramLoginModal({
  open,
  onOpenChange,
  config,
  onSuccess,
  inviteCode,
  purpose = "login",
}: TelegramLoginModalProps) {
  const botEnabled =
    Boolean(config?.bot_enabled) ||
    Boolean(config?.bot_username) ||
    Boolean(config?.dev_qr)
  const isDevQr = Boolean(config?.dev_qr) && !Boolean(config?.bot_username)

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [challenge, setChallenge] = useState<TelegramBotChallenge | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [success, setSuccess] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const finish = useCallback((data: any) => {
    setSuccess(true)
    // Brief success state, then close + notify parent
    window.setTimeout(() => {
      onOpenChange(false)
      onSuccess?.(data)
    }, 900)
  }, [onOpenChange, onSuccess])

  const handleQrLogin = useCallback(async () => {
    if (!botEnabled) return
    setError(null)
    setBusy(true)
    setPolling(true)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      if (purpose === "link") {
        const chResp = await api.post("/auth/telegram/bot/challenge", { purpose: "link" })
        const ch: TelegramBotChallenge = chResp.data
        setChallenge(ch)
        try {
          const url = await QRCode.toDataURL(ch.deep_link, { width: 180, margin: 2 })
          setQrDataUrl(url)
        } catch (qrErr) {
          console.error("Failed to generate QR code:", qrErr)
        }

        const deadline = Date.now() + ch.expires_in * 1000
        const pollSecret = ch.poll_secret

        await new Promise<any>((resolve, reject) => {
          let stopped = false
          let timer: ReturnType<typeof setTimeout> | null = null

          const cleanup = () => {
            stopped = true
            if (timer) clearTimeout(timer)
            controller.signal.removeEventListener("abort", onAbort)
          }

          const onAbort = () => {
            cleanup()
            reject(new Error("Привязка Telegram отменена"))
          }
          controller.signal.addEventListener("abort", onAbort)

          const tick = async () => {
            if (stopped) return
            if (Date.now() > deadline) {
              cleanup()
              reject(new Error("Время ожидания подтверждения истекло"))
              return
            }
            try {
              const status = await pollTelegramBotChallenge(ch.challenge_id, pollSecret)
              if (status.status === "confirmed") {
                cleanup()
                resolve(status)
                return
              }
              if (status.status === "expired") {
                cleanup()
                reject(new Error("Срок действия запроса истек. Попробуйте еще раз."))
                return
              }
            } catch (err) {
              if (stopped) return
              cleanup()
              reject(err instanceof Error ? err : new Error(String(err)))
              return
            }
            timer = setTimeout(tick, 1500)
          }
          timer = setTimeout(tick, 1500)
        })

        const linkResp = await api.post("/auth/telegram/link", { challenge_id: ch.challenge_id })
        finish(linkResp.data)
      } else {
        const loginData = await startTelegramBotLogin({
          onChallenge: async (ch) => {
            setChallenge(ch)
            try {
              const url = await QRCode.toDataURL(ch.deep_link, { width: 180, margin: 2 })
              setQrDataUrl(url)
            } catch (qrErr) {
              console.error("Failed to generate QR code:", qrErr)
            }
          },
          signal: controller.signal,
          // QR tab: user scans the code with their phone — no auto-open.
          openDeepLink: false,
        }, inviteCode)
        finish(loginData)
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        const detail = err.response?.data?.detail || err.message
        setError(translateTelegramError(detail))
      }
    } finally {
      setBusy(false)
      setPolling(false)
    }
  }, [botEnabled, finish, inviteCode, purpose])

  const cancelQr = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setChallenge(null)
    setQrDataUrl(null)
    setPolling(false)
    setError(null)
  }, [])

  const refreshQr = useCallback(() => {
    cancelQr()
    handleQrLogin()
  }, [cancelQr, handleQrLogin])

  // Reset state when modal opens/closes, and start QR login automatically
  useEffect(() => {
    if (open) {
      setError(null)
      setChallenge(null)
      setQrDataUrl(null)
      setBusy(false)
      setPolling(false)
      setSuccess(false)
      handleQrLogin()
    } else {
      abortRef.current?.abort()
      abortRef.current = null
      setQrDataUrl(null)
    }
    return () => {
      abortRef.current?.abort()
    }
  }, [open, handleQrLogin])

  if (!config || !botEnabled) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          // Don't close while polling — user might lose the QR
          if (polling) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (polling) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#2AABEE] text-white"
              aria-hidden
            >
              <TelegramIcon className="h-4 w-4" />
            </span>
            {purpose === "link" ? "Привязка Telegram" : "Вход через Telegram"}
          </DialogTitle>
          <DialogDescription>
            {purpose === "link" ? "Подтвердите привязку Telegram" : "Подтвердите вход с помощью Telegram"}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <SuccessState purpose={purpose} />
        ) : (
          <div className="space-y-4">
            <QrPanel
              challenge={challenge}
              qrDataUrl={qrDataUrl}
              polling={polling}
              isDevQr={isDevQr}
              onCancel={refreshQr}
            />

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy && !polling}
              >
                {polling ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Ждём подтверждения…
                  </span>
                ) : (
                  "Закрыть"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SuccessState({ purpose }: { purpose: "login" | "link" }) {
  return (
    <div className="py-8 text-center space-y-2">
      <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
        <Check className="h-6 w-6 text-emerald-600" />
      </div>
      <p className="font-semibold text-foreground">
        {purpose === "link" ? "Telegram успешно привязан" : "Вход выполнен"}
      </p>
      <p className="text-sm text-muted-foreground">
        {purpose === "link" ? "Обновление профиля…" : "Перенаправление в HRMS…"}
      </p>
    </div>
  )
}

function QrPanel({
  challenge,
  qrDataUrl,
  polling,
  isDevQr,
  onCancel,
}: {
  challenge: TelegramBotChallenge | null
  qrDataUrl: string | null
  polling: boolean
  isDevQr: boolean
  onCancel: () => void
}) {
  if (!challenge) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#2AABEE]" />
        <p className="text-sm text-muted-foreground">Генерация QR-кода...</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4 text-center">
      <p className="text-xs text-slate-600 leading-relaxed">
        {isDevQr ? (
          <>
            Фейк-режим (TELEGRAM_DEV_FAKE_CONFIRM). Для реального Telegram
            задайте <code>TELEGRAM_BOT_TOKEN</code> and{" "}
            <code>TELEGRAM_BOT_USERNAME</code>.
          </>
        ) : (
          <>
            Отсканируйте QR-код камерой телефона или в приложении Telegram, либо нажмите кнопку ниже для перехода.
          </>
        )}
      </p>
      {qrDataUrl ? (
        <img
          src={qrDataUrl}
          alt="QR для входа через Telegram"
          width={180}
          height={180}
          className="mx-auto rounded-lg bg-white p-2 border border-slate-200"
        />
      ) : (
        <div className="mx-auto flex h-[180px] w-[180px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-2">
          <Loader2 className="h-8 w-8 animate-spin text-[#2AABEE]" />
          <p className="mt-2 text-xs text-muted-foreground">Генерация QR...</p>
        </div>
      )}
      <div className="space-y-2 pt-1">
        <Button
          asChild
          className="w-full bg-[#2AABEE] hover:bg-[#229ED9] text-white"
        >
          <a
            href={challenge.deep_link}
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть Telegram
          </a>
        </Button>
        <a
          href={challenge.deep_link}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-[#2AABEE] hover:underline break-all"
        >
          {challenge.deep_link}
        </a>
      </div>
      {polling && (
        <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Ждём подтверждения…
        </p>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer inline-flex items-center gap-1"
      >
        <X className="h-3 w-3" />
        Обновить QR-код
      </button>
    </div>
  )
}
