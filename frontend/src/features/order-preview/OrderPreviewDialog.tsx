import { useEffect } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { PlaceholderHighlight } from "./placeholder-highlight"

import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"

interface OrderPreviewDialogProps {
  open: boolean
  html: string
  isSubmitting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (editedHtml: string) => void
}

export function OrderPreviewDialog({
  open,
  html,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: OrderPreviewDialogProps) {
  const editor = useEditor({
    extensions: [StarterKit, PlaceholderHighlight.configure({ multicolor: true })],
    content: html,
    immediatelyRender: false,
  })

  useEffect(() => {
    if (editor && open) {
      editor.commands.setContent(html || "<p></p>", false)
    }
  }, [editor, html, open])

  const handleConfirm = () => {
    onConfirm(editor?.getHTML() || html)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Предпросмотр приказа</DialogTitle>
          <DialogDescription>
            Проверьте и при необходимости отредактируйте текст перед созданием приказа.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-[420px] overflow-auto border rounded-md p-3 bg-background">
          <EditorContent
            editor={editor}
            className="outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[380px] [&_.ProseMirror_.missing-template-warning]:text-red-600 [&_.ProseMirror_.missing-template-warning]:font-bold [&_.ProseMirror_mark[data-placeholder-key]]:bg-yellow-200 [&_.ProseMirror_mark[data-placeholder-key]]:px-1 [&_.ProseMirror_mark[data-placeholder-key]]:rounded-sm"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Создание..." : "Создать приказ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
