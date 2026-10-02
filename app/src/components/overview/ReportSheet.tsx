import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Download, Link2, Send } from 'lucide-react'
import { CopyIcon } from '@/components/icons/hf'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { createReportLink, getReportHtml } from '@/lib/api'
import { shareLink } from '@/lib/bot'
import { isInsideTelegram, openTelegramLink } from '@/lib/telegram'

/**
 * «Выписка» — длинный чек с итогами месяца. Собирается на сервере (report),
 * показывается в iframe без прав (sandbox="" — ни скриптов, ни сети: страница
 * только отображает цифры). Поделиться — временная ссылка (5 минут) на хосте
 * мини-аппа, открывается без входа: можно переслать партнёру.
 */
export function ReportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [link, setLink] = useState<{ url: string; downloadUrl: string; expiresAt: string } | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setHtml(null)
    setError(false)
    setLink(null)
    getReportHtml()
      .then((h) => !cancelled && setHtml(h))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [open])

  // Ссылка просрочена — прячем, чтобы не отправили мёртвую.
  useEffect(() => {
    if (!link) return
    const left = new Date(link.expiresAt).getTime() - Date.now()
    const t = setTimeout(() => setLink(null), Math.max(0, left))
    return () => clearTimeout(t)
  }, [link])

  async function create() {
    setCreating(true)
    try {
      setLink(await createReportLink())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось создать ссылку')
    } finally {
      setCreating(false)
    }
  }

  function share(url: string) {
    const text = 'Выписка Hlow Flow — ссылка живёт 5 минут'
    if (isInsideTelegram()) openTelegramLink(shareLink(url, text))
    else navigator.clipboard?.writeText(url).then(() => toast.success('Ссылка скопирована'))
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Ссылка скопирована')
    } catch {
      toast.error('Не получилось скопировать — выдели ссылку вручную')
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
        <div className="space-y-2 px-4 pb-6 pt-2">
          {link ? (
            <>
              <p className="break-all rounded-[12px] bg-hf-card px-3 py-2 font-mono text-[11px] text-hf-text-2">{link.url}</p>
              <p className="text-[11px] text-hf-text-4">
                Действует до {new Date(link.expiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} — открывается без входа, можно переслать партнёру.
              </p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => share(link.url)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[13px] bg-hf-accent py-3.5 text-[15px] font-medium text-white"
                >
                  <Send className="h-4 w-4" />
                  Отправить
                </button>
                <button
                  type="button"
                  onClick={() => copy(link.url)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[13px] bg-hf-card py-3.5 text-[15px] text-hf-text-2"
                >
                  <CopyIcon className="h-4 w-4" />
                  Копировать
                </button>
              </div>
              <a
                href={link.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-hf-card py-3 text-[14px] text-hf-text-2"
              >
                <Download className="h-4 w-4" />
                Скачать HTML
              </a>
            </>
          ) : (
            <button
              type="button"
              onClick={create}
              disabled={!html || creating}
              className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-hf-accent py-3.5 text-[15px] font-medium text-white disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" />
              {creating ? 'Делаю ссылку…' : 'Ссылка на 5 минут'}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
