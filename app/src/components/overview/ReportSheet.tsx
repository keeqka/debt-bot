import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { getReportHtml, sendReportToTelegram } from '@/lib/api'

/**
 * «Выписка» — длинный чек с итогами месяца. Собирается на сервере (report),
 * показывается в iframe без прав (sandbox="" — ни скриптов, ни сети: страница
 * только отображает цифры), а кнопка присылает её файлом в чат с ботом.
 */
export function ReportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setHtml(null)
    setError(false)
    getReportHtml()
      .then((h) => !cancelled && setHtml(h))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [open])

  async function send() {
    setSending(true)
    try {
      await sendReportToTelegram()
      toast.success('Выписка отправлена в чат с ботом')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось отправить')
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[92vh] flex-col rounded-t-[24px] border-hf-line bg-hf-bg">
        <SheetHeader className="px-4 pt-1 pb-0">
          <SheetTitle className="text-[15px] font-medium text-hf-text">Выписка</SheetTitle>
          <SheetDescription className="text-[13px] text-hf-text-3">Прошлый и этот месяц, что поправить, долги и цели.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 px-2">
          {html ? (
            <iframe title="Выписка" sandbox="" srcDoc={html} className="h-full w-full rounded-[14px] border-0 bg-[#17181c]" />
          ) : (
            <p className="px-2 pt-6 text-center text-[13px] text-hf-text-4">{error ? 'Не удалось собрать выписку — попробуй позже.' : 'Собираю выписку…'}</p>
          )}
        </div>
        <div className="px-4 pb-6 pt-2">
          <button
            type="button"
            onClick={send}
            disabled={!html || sending}
            className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-hf-accent py-3.5 text-[15px] font-medium text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Отправляю…' : 'Прислать файлом в Telegram'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
