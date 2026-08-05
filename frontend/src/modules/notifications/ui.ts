/**
 * Единая точка импорта UI-примитивов (shadcn) для всего модуля.
 *
 * При переносе модуля в другое приложение достаточно поправить пути
 * в ЭТОМ файле (или заменить реализации) — остальной код не трогаем.
 */

export { cn } from "@/shared/utils/cn"
export { Button } from "@/shared/ui/button"
export { Popover, PopoverTrigger, PopoverContent } from "@/shared/ui/popover"
