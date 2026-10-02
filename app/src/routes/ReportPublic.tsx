import { useEffect, useState } from 'react'
import { getPublicReport, type PublicReport } from '@/lib/public-report'

/**
 * Страница ссылки /report/<токен>: «Выписка» без входа в приложение. Живёт до
 * конца срока ссылки (5 минут) — по таймеру или просроченному ответу сервера
 * показываем «ссылка устарела». html — в iframe без прав (ни скриптов, ни сети).
 */
export function ReportPublic({ token }: { token: string }) {
  const [report, setReport] = useState<PublicReport | null>(null)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.appendChild(robots)
    document.title = 'Hlow Flow — выписка'
    return () => robots.remove()
  }, [])

  useEffect(() => {
    let cancelled = false
    getPublicReport(token).then((r) => !cancelled && setReport(r))
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (report?.status !== 'ok') return
    const left = new Date(report.expiresAt).getTime() - Date.now()
    if (left <= 0) return setExpired(true)
    const t = setTimeout(() => setExpired(true), left)
    return () => clearTimeout(t)
  }, [report])

  const message =
    report === null
      ? 'Открываю выписку…'
      : report.status === 'expired' || expired
        ? 'Ссылка устарела — она живёт 5 минут. Попроси новую в Hlow Flow.'
        : report.status === 'error'
          ? 'Не удалось открыть выписку — попробуй позже.'
          : null

  return (
    <div className="flex min-h-dvh flex-col bg-[#17181c]">
      {message || report?.status !== 'ok' ? (
        <p className="m-auto max-w-xs px-6 text-center text-[14px] leading-relaxed text-[#a9a59c]">{message}</p>
      ) : (
        <>
          <iframe title="Выписка" sandbox="" srcDoc={report.html} className="min-h-0 w-full flex-1 border-0" />
          <p className="px-4 py-2 text-center font-mono text-[11px] text-[#7b7568]">
            Ссылка действует до {new Date(report.expiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </>
      )}
    </div>
  )
}
