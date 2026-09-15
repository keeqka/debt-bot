import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Mascot } from '@/components/Mascot'
import { Eyebrow } from '@/components/chrome/Chrome'
import { useAddExpense, useCategories, useLogReceiptScan, useUpdateUser } from '@/hooks/use-finance-data'
import { useCurrentUser, useCurrentUserId } from '@/lib/auth'
import { parseReceipt } from '@/lib/api'
import { fileToBase64 } from '@/lib/file-to-base64'
import { AddDebtDialog } from '@/components/debts/AddDebtDialog'

type Step = 'receipt' | 'income' | 'debts'

/**
 * 3 шага, все кроме первого — со «Пропустить» (ТЗ FUNCTIONAL.md §2). Шаг 1
 * — упрощённая версия таба «Чеки» (без построчного редактирования: цель
 * онбординга — скорость и первое впечатление, а не точность). Гейтится в
 * AppShell по users.onboarding_completed_at.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('receipt')
  const user = useCurrentUser()
  const updateUser = useUpdateUser()

  function finish() {
    updateUser.mutate({ id: user.id, patch: { onboarding_completed_at: new Date().toISOString() } })
    onDone()
  }

  return (
    <div className="flex h-full flex-col bg-hf-bg px-4 pt-6 pb-4">
      <div className="mb-5 flex gap-1.5">
        {(['receipt', 'income', 'debts'] as const).map((s) => (
          <div key={s} className={s === step || stepIndex(s) < stepIndex(step) ? 'h-1 flex-1 rounded-full bg-hf-accent' : 'h-1 flex-1 rounded-full bg-hf-card'} />
        ))}
      </div>

      {step === 'receipt' && <ReceiptStep onNext={() => setStep('income')} />}
      {step === 'income' && <IncomeStep onNext={() => setStep('debts')} onSkip={() => setStep('debts')} />}
      {step === 'debts' && <DebtsStep onFinish={finish} />}
    </div>
  )
}

function stepIndex(s: Step) {
  return s === 'receipt' ? 0 : s === 'income' ? 1 : 2
}

function ReceiptStep({ onNext }: { onNext: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const userId = useCurrentUserId()
  const { data: categories } = useCategories()
  const addExpense = useAddExpense()
  const logScan = useLogReceiptScan()
  const [status, setStatus] = useState<'idle' | 'reading' | 'error'>('idle')

  async function handleFile(file: File) {
    setStatus('reading')
    try {
      const base64 = await fileToBase64(file)
      await logScan.mutateAsync(userId)
      const result = await parseReceipt(base64, file.type || 'image/jpeg')
      if (!result.is_valid_receipt) {
        setStatus('error')
        return
      }
      const matched = categories?.find((c) => c.name === result.suggested_category)
      await addExpense.mutateAsync({
        user_id: userId,
        amount: result.total_amount ?? 0,
        currency: result.currency ?? 'KZT',
        category_id: matched?.id ?? null,
        merchant: result.merchant,
        spent_at: result.date ?? new Date().toISOString().slice(0, 10),
        description: null,
        source: 'receipt_photo',
        receipt_asset_path: null,
        ai_confidence: result.confidence,
        is_confirmed: true,
      })
      toast.success('Расход сохранён — можно уточнить детали позже, в «Чеках»')
      onNext()
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      <div className="h-[150px] w-[120px]">
        <Mascot expression={status === 'reading' ? 'focused' : status === 'error' ? 'alert' : 'calm'} />
      </div>
      {status === 'reading' ? (
        <p className="text-[13px] text-hf-text-3">
          Разбираю чек... Дальше он сам разложит по категориям, посчитает бюджет и подскажет, когда закроются долги.
        </p>
      ) : status === 'error' ? (
        <p className="text-[13px] text-hf-warn-on-dark">Не разобрал — попробуй другое фото, или пропусти этот шаг.</p>
      ) : (
        <>
          <h2 className="text-[22px] font-semibold text-hf-text">Скинь первый чек</h2>
          <p className="max-w-[26ch] text-[13px] leading-relaxed text-hf-text-3">
            Фото, скриншот перевода — что угодно. Он сам разберёт, что там куплено.
          </p>
        </>
      )}
      <div className="flex w-full flex-col gap-2.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={status === 'reading'}
          className="rounded-[14px] bg-hf-accent py-3.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {status === 'error' ? 'Попробовать ещё раз' : 'Сфотографировать чек'}
        </button>
        <button type="button" onClick={onNext} className="text-[13px] text-hf-text-4">
          Пропустить
        </button>
      </div>
    </div>
  )
}

function IncomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const user = useCurrentUser()
  const updateUser = useUpdateUser()
  const [income, setIncome] = useState('')
  const [payday, setPayday] = useState('')

  function save() {
    const incomeNum = Number(income)
    const paydayNum = Number(payday)
    updateUser.mutate({
      id: user.id,
      patch: {
        monthly_income: income.trim() && Number.isFinite(incomeNum) ? incomeNum : null,
        payday: payday.trim() && Number.isFinite(paydayNum) && paydayNum >= 1 && paydayNum <= 31 ? paydayNum : null,
      },
    })
    onNext()
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="space-y-1.5">
        <Eyebrow>Шаг 2 из 3</Eyebrow>
        <h2 className="text-[22px] font-semibold text-hf-text">Сколько зарабатываешь?</h2>
        <p className="text-[13px] leading-relaxed text-hf-text-3">
          Нужно, чтобы считать «можно тратить в день». Без этого будут видны только траты — без прогноза.
        </p>
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs text-hf-text-4">Доход в месяц, ₸</label>
          <input
            type="number"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            placeholder="Например, 400000"
            className="h-11 w-full rounded-[12px] border border-hf-line bg-hf-card px-3.5 text-sm text-hf-text outline-none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-hf-text-4">День зарплаты</label>
          <input
            type="number"
            min={1}
            max={31}
            value={payday}
            onChange={(e) => setPayday(e.target.value)}
            placeholder="Например, 5"
            className="h-11 w-full rounded-[12px] border border-hf-line bg-hf-card px-3.5 text-sm text-hf-text outline-none"
          />
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-2.5">
        <button type="button" onClick={save} className="rounded-[14px] bg-hf-accent py-3.5 text-sm font-medium text-white">
          Далее
        </button>
        <button type="button" onClick={onSkip} className="text-[13px] text-hf-text-4">
          Пропустить
        </button>
      </div>
    </div>
  )
}

function DebtsStep({ onFinish }: { onFinish: () => void }) {
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="space-y-1.5">
        <Eyebrow>Шаг 3 из 3</Eyebrow>
        <h2 className="text-[22px] font-semibold text-hf-text">Есть кредитка или рассрочка?</h2>
        <p className="text-[13px] leading-relaxed text-hf-text-3">Добавь — покажем дату, когда всё закроется, и порядок выплат.</p>
      </div>
      <div className="mt-auto flex flex-col gap-2.5">
        <button type="button" onClick={() => setAddOpen(true)} className="rounded-[14px] bg-hf-accent py-3.5 text-sm font-medium text-white">
          Добавить долг
        </button>
        <button type="button" onClick={onFinish} className="text-[13px] text-hf-text-4">
          Нет долгов — пропустить
        </button>
      </div>
      <AddDebtDialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open)
          if (!open) onFinish()
        }}
      />
    </div>
  )
}

