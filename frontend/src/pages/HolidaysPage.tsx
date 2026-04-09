import { useState } from "react"
import { Plus, Trash2, Calendar, Copy } from "lucide-react"
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
  
  const { holidays, isLoading, refetch, addHoliday, deleteHoliday, seedHolidays, isSeeding } = useHolidaysApi(year)

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
        
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[2026, 2027, 2028].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-muted-foreground items-center">
        <span>Всего: {holidays?.length || 0}</span>
        <span>Вых: {holidays?.filter((h) => isWeekend(h.date)).length || 0}</span>
        <span>Раб: {holidays?.filter((h) => !isWeekend(h.date)).length || 0}</span>
        {showAdded && (
          <span className="text-green-600 font-medium animate-pulse">✓ Праздник добавлен</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 items-center">
        {isAdding ? (
          <>
            <DatePicker
              value={newDate}
              onChange={setNewDate}
              className="w-[130px]"
            />
            <input
              type="text"
              placeholder="Название"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="w-[180px] h-10 px-2 text-sm border rounded"
            />
<Button onClick={handleAdd} disabled={!newDate || !newName} size="sm" className="h-10 text-sm px-3">
              ✓
            </Button>
            <Button variant="ghost" onClick={() => setIsAdding(false)} size="sm" className="h-10 px-2">
              ✕
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setIsAdding(true)} size="sm" className="h-10 text-sm">
              <Plus className="h-4 w-4 mr-1" />
              Добавить
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSeed}
              disabled={isSeeding}
              className="h-10 text-sm"
            >
              <Copy className="h-4 w-4 mr-1" />
              Заполнить РБ
            </Button>
          </>
        )}
      </div>

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
                  Нет праздников. Нажми "Заполнить РБ"
                </td>
              </tr>
            ) : (
              sortedHolidays.map((holiday) => (
                <tr
                  key={holiday.id}
                  className={`border-t ${
                    isWeekend(holiday.date) 
                      ? "bg-red-50 dark:bg-red-950/20" 
                      : "hover:bg-muted/30"
                  }`}
                >
                  <td className="px-3 py-2">
                    <span className={isWeekend(holiday.date) ? "text-red-600 font-medium" : ""}>
                      {formatDateWithYear(holiday.date)}
                    </span>
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