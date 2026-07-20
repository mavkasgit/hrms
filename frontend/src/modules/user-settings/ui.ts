/**
 * Единая точка импорта UI-примитивов (shadcn) для всего модуля.
 *
 * При переносе модуля в другое приложение достаточно поправить пути
 * в ЭТОМ файле (или заменить реализации) — остальной код не трогаем.
 */

export { cn } from "@/shared/utils/cn"
export { Button } from "@/shared/ui/button"
export { Input } from "@/shared/ui/input"
export { Badge } from "@/shared/ui/badge"
export { Skeleton } from "@/shared/ui/skeleton"
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip"
