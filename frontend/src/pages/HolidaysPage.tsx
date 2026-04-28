import { useState } from "react"
import { Plus, Trash2, Calendar, Copy, ExternalLink } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { DatePicker } from "@/shared/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog"
import { useHolidaysApi } from "./HolidaysApi"
import { parseDate, formatDateWithYear, getDayName, isWeekend } from "@/shared/utils/date"

export function HolidaysPage() {
  const [year, setYear] = useState(2026)
  const [newDate, setNewDate] = useState("")
  const [newName, setNewName] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [showAdded, setShowAdded] = useState(false)
  const [clearAllOpen, setClearAllOpen] = useState(false)
  
  const { holidays, isLoading, refetch, addHoliday, deleteHoliday, deleteAllHolidays, seedHolidays, isSeeding } = useHolidaysApi(year)

  const handleAdd = async () => {
    if (!isAdding || !newDate || !newName) {
      setIsAdding(true)
      return
    }
    await addHoliday({ date: newDate, name: newName })
    setNewDate("")
    setNewName("")
    setIsAdding(false)
    setShowAdded(true)
    setTimeout(() => setShowAdded(false), 2000)
    refetch()
  }

  const handleSeed = async () => {
    await seedHolidays(year)
    refetch()
  }

  // Sort holidays by date
  const sortedHolidays = [...(holidays || [])].sort((a, b) => {
    const da = parseDate(a.date)
    const db = parseDate(b.date)
    if (!da || !db) return 0
    return da.getTime() - db.getTime()
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Праздники
        </h1>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-muted-foreground items-center flex-wrap">
        <span>Всего: {holidays?.length || 0}</span>
        <span>Вых: {holidays?.filter((h) => isWeekend(h.date)).length || 0}</span>
        <span>Раб: {holidays?.filter((h) => !isWeekend(h.date)).length || 0}</span>
        {showAdded && (
          <span className="text-green-600 font-medium animate-pulse">✓ Праздник добавлен</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 items-center">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[100px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[2026, 2027, 2028].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdding ? (
          <>
            <input
              type="text"
              placeholder="Название"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-[180px] h-10 px-2 text-sm border rounded"
              autoFocus
            />
            <DatePicker
              value={newDate}
              onChange={setNewDate}
              className="w-[130px]"
            />
            <Button onClick={handleAdd} disabled={!newDate || !newName} size="sm" className="h-10 text-xs">
              Создать
            </Button>
            <Button variant="ghost" onClick={() => setIsAdding(false)} size="sm" className="h-10 text-xs">
              Отмена
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setIsAdding(true)} size="sm" className="h-10 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Добавить
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearAllOpen(true)}
              disabled={!holidays || holidays.length === 0}
              className="h-10 text-xs"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Очистить все
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSeed}
              disabled={isSeeding}
              className="h-10 text-xs"
            >
              <Copy className="h-3.5 w-3.5 mr-1" />
              Заполнить стандартные государственные праздники
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 text-xs"
              asChild
            >
              <a
                href="https://www.mintrud.gov.by/ru/proizvodstvennyy-kalendar-ru"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Официальный производственный календарь
              </a>
            </Button>
          </>
        )}
      </div>

      {/* Clear all confirmation */}
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить все праздники за {year} год?</AlertDialogTitle>
            <AlertDialogDescription>
              Все праздники за {year} год будут удалены. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await deleteAllHolidays()
                setClearAllOpen(false)
              }}
              className="bg-red-500 hover:bg-red-600"
              autoFocus
            >
              Удалить все
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden max-w-[800px]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Дата</th>
              <th className="text-left px-3 py-2 font-medium">День</th>
              <th className="text-left px-3 py-2 font-medium">Название</th>
              <th className="text-right px-2 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground text-xs">
                  Загрузка...
                </td>
              </tr>
            ) : sortedHolidays.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground text-xs">
                  Нет праздников. Нажми "Заполнить стандартные государственные праздники"
                </td>
              </tr>
            ) : (
              sortedHolidays.map((holiday) => (
                <tr
                  key={holiday.id}
                  className="border-t hover:bg-muted/30"
                >
                  <td className="px-3 py-2">
                    {formatDateWithYear(holiday.date)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {getDayName(holiday.date)}
                  </td>
                  <td className="px-3 py-2">{holiday.name}</td>
                  <td className="px-2 py-2 text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Удалить праздник?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Праздник "{holiday.name}" ({formatDateWithYear(holiday.date)}) будет удалён. Это действие нельзя отменить.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Отмена</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteHoliday(holiday.id).then(refetch)}
                            className="bg-red-500 hover:bg-red-600"
                            autoFocus
                          >
                            Удалить
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}