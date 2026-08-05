import { useCallback, useEffect, useState } from "react"
import {
  CheckCircle2,
  History,
  Laptop,
  Loader2,
  MonitorSmartphone,
  RefreshCw,
  Smartphone,
  Tablet,
  XCircle,
} from "lucide-react"
import { useUserSettings } from "../context"
import { formatDateTime, formatRelativeTime } from "../lib/datetime"
import { detectDeviceKind } from "../lib/device"
import type { LoginEventListResult, SessionInfo, SessionListResult } from "../types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Skeleton,
} from "../ui"
import { Card, StatusPill } from "./ui-bits"

function DeviceIcon({ session }: { session: SessionInfo }) {
  const kind = detectDeviceKind(session.device_label, session.user_agent)
  const Icon =
    kind === "mobile"
      ? Smartphone
      : kind === "tablet"
        ? Tablet
        : kind === "desktop"
          ? Laptop
          : MonitorSmartphone
  return <Icon className="h-5 w-5" />
}

type ConfirmState =
  | { kind: "current"; session: SessionInfo }
  | { kind: "others" }
  | null

/**
 * Панель «Сессии»: активные сеансы с отзывом + история входов.
 * Разрушающие действия — через AlertDialog-подтверждение.
 */
export function SessionsPanel() {
  const { api, dict, notify, onLogoutRequest } = useUserSettings()

  const [list, setList] = useState<SessionListResult>({ sessions: [], total: 0 })
  const [history, setHistory] = useState<LoginEventListResult>({ events: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const { sessions, total } = list
  const { events, total: eventsTotal } = history

  const intl = dict.meta.intl
  const methodLabel = (m: string | null | undefined) =>
    (m && dict.loginMethods[m]) || m || "—"

  const load = useCallback(async () => {
    setLoading(true)
    setSessionsError(null)
    setEventsError(null)
    const [sessionsResult, eventsResult] = await Promise.allSettled([
      api.listSessions ? api.listSessions() : Promise.resolve({ sessions: [], total: 0 }),
      api.listLoginEvents
        ? api.listLoginEvents()
        : Promise.resolve({ events: [], total: 0 }),
    ])
    if (sessionsResult.status === "fulfilled") {
      setList(sessionsResult.value)
    } else {
      setSessionsError(dict.errors.sessions)
    }
    if (eventsResult.status === "fulfilled") {
      setHistory(eventsResult.value)
    } else {
      setEventsError(dict.errors.events)
    }
    setLoading(false)
  }, [api, dict.errors.sessions, dict.errors.events])

  useEffect(() => {
    void load()
  }, [load])

  const revokeOne = async (session: SessionInfo) => {
    if (!api.revokeSession || revokingId) return
    setRevokingId(session.id)
    setSessionsError(null)
    try {
      await api.revokeSession(session.id)
      if (session.is_current) {
        onLogoutRequest?.()
        return
      }
      await load()
    } catch {
      setSessionsError(dict.errors.revoke)
      notify?.({ title: dict.errors.revoke, variant: "destructive" })
    } finally {
      setRevokingId(null)
    }
  }

  const handleConfirm = async () => {
    if (!confirmState) return
    setConfirmBusy(true)
    try {
      if (confirmState.kind === "current") {
        await revokeOne(confirmState.session)
      } else if (api.revokeOtherSessions) {
        setSessionsError(null)
        try {
          await api.revokeOtherSessions()
          await load()
        } catch {
          setSessionsError(dict.errors.revokeOthers)
          notify?.({ title: dict.errors.revokeOthers, variant: "destructive" })
        }
      }
    } finally {
      setConfirmBusy(false)
      setConfirmState(null)
    }
  }

  const hasOthers = sessions.some((s) => !s.is_current)

  const lastOfN = (template: string, shown: number, all: number) =>
    template.replace("{shown}", String(shown)).replace("{total}", String(all))

  const shownLabel =
    !loading && total > 0 ? lastOfN(dict.sessions.lastOfN, sessions.length, total) : null

  // Счётчик истории: только когда есть скрытые записи (total > показанных).
  const historyShownLabel =
    !loading && eventsTotal > events.length
      ? lastOfN(dict.sessions.historyLastOfN, events.length, eventsTotal)
      : null

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MonitorSmartphone className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {dict.sessions.description}
              </p>
              {shownLabel && (
                <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                  {shownLabel}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              className="h-8 rounded-xl text-xs"
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              {dict.sessions.refresh}
            </Button>
            {hasOthers && api.revokeOtherSessions && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmState({ kind: "others" })}
                className="h-8 rounded-xl text-xs"
              >
                {dict.sessions.revokeOthers}
              </Button>
            )}
          </div>
        </div>

        {sessionsError && (
          <p className="mb-3 text-xs text-destructive">{sessionsError}</p>
        )}

        {loading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
            ))}
          </div>
        ) : sessions.length === 0 && !sessionsError ? (
          <p className="py-2 text-xs text-muted-foreground">
            {dict.sessions.empty}
          </p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-start gap-3 rounded-2xl border border-border/80 bg-background p-3.5"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    session.is_current
                      ? "bg-green-500/10 text-green-500"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <DeviceIcon session={session} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate text-sm font-semibold text-foreground">
                      {session.device_label?.trim() || dict.sessions.unknownDevice}
                    </h4>
                    {session.is_current && (
                      <StatusPill tone="success" pulse>
                        {dict.sessions.currentBadge}
                      </StatusPill>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-mono text-[11px]">
                      {session.ip_address?.trim() || dict.sessions.unknownIp}
                    </span>
                    {" · "}
                    {methodLabel(session.login_method)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                    {dict.sessions.lastActive}:{" "}
                    {formatRelativeTime(session.last_seen_at, intl)}
                    {" · "}
                    {dict.sessions.signedIn}:{" "}
                    {formatDateTime(session.created_at, intl)}
                  </p>
                </div>
                {api.revokeSession &&
                  (session.is_current ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={revokingId === session.id}
                      onClick={() => setConfirmState({ kind: "current", session })}
                      className="h-8 shrink-0 rounded-xl text-xs text-muted-foreground"
                    >
                      {dict.sessions.revoke}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={revokingId === session.id}
                      onClick={() => void revokeOne(session)}
                      className="h-8 shrink-0 rounded-xl text-xs"
                    >
                      {revokingId === session.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        dict.sessions.revoke
                      )}
                    </Button>
                  ))}
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 rounded-xl border border-border/40 bg-muted/10 p-3 text-[11px] text-muted-foreground/70">
          {dict.sessions.noteText}
        </p>
      </Card>

      {api.listLoginEvents && (
        <Card>
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <History className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">
                {dict.sessions.historyTitle}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {dict.sessions.historyDescription}
              </p>
              {historyShownLabel && (
                <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                  {historyShownLabel}
                </p>
              )}
            </div>
          </div>
          {eventsError && (
            <p className="mb-3 text-xs text-destructive">{eventsError}</p>
          )}
          {loading ? (
            <div className="space-y-1.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-11 w-full rounded-xl" />
              ))}
            </div>
          ) : events.length === 0 && !eventsError ? (
            <p className="py-1 text-xs text-muted-foreground">
              {dict.sessions.historyEmpty}
            </p>
          ) : (
            <div className="space-y-1.5">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5"
                >
                  <div className="mt-0.5 shrink-0">
                    {event.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {event.success
                          ? dict.sessions.successLogin
                          : dict.sessions.failedLogin}
                      </span>
                      {event.login_method && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {methodLabel(event.login_method)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {event.device_label?.trim() || dict.sessions.unknownDevice}
                      {" · "}
                      <span className="font-mono">
                        {event.ip_address?.trim() || dict.sessions.unknownIp}
                      </span>
                    </p>
                    {!event.success && event.failure_reason && (
                      <p className="mt-0.5 text-[11px] text-destructive/90">
                        {event.failure_reason}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">
                    {formatDateTime(event.created_at, intl)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Подтверждение разрушающих действий */}
      <AlertDialog
        open={confirmState !== null}
        onOpenChange={(v) => !v && setConfirmState(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmState?.kind === "current"
                ? dict.sessions.revokeCurrentConfirmTitle
                : dict.sessions.revokeOthersConfirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmState?.kind === "current"
                ? dict.sessions.revokeCurrentConfirmDescription
                : dict.sessions.revokeOthersConfirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>
              {dict.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleConfirm()
              }}
              disabled={confirmBusy}
            >
              {confirmBusy ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {dict.sessions.confirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
