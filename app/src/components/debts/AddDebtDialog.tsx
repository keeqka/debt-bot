import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, Loader2 } from 'lucide-react'
import { FormSheet, FormField, Segmented, SaveButton, formInputClass } from '@/components/chrome/FormSheet'
import { useAddDebt, useUpdateDebt } from '@/hooks/use-finance-data'
import { useCurrentUserId } from '@/lib/auth'
import { assistDebtDraft } from '@/lib/api'
import type { Debt, DebtDraft, DebtStatus, ProposedDebt } from '@/types/domain'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface FormState {
  title: string
  creditor: string
  principalAmount: string
  currentBalance: string
  interestRate: string
  minimumPayment: string
  dueDay: string
  status: DebtStatus
  notes: string
}

const EMPTY_FORM: FormState = {
  title: '',
  creditor: '',
  principalAmount: '',
  currentBalance: '',
  interestRate: '',
  minimumPayment: '',
  dueDay: '',
  status: 'active',
  notes: '',
}

/**
 * Добавление/редактирование долга — нижний лист, как и всё остальное в
 * приложении (было: центральный shadcn Dialog с Input/Select/Label —
 * единственное место в «Долгах», выглядевшее чужим десктопным попапом).
 *
 * AI-разбор скриншота — бумажная логика (это данные, которые ИИ прочитал с
 * фото), но лежит на тёмной форме, поэтому оформлен акцентной рамкой, а не
 * светлой карточкой: полноценная бумага здесь неуместна, это всего одна
 * кнопка и заметка результата, не документ.
 */
export function AddDebtDialog({
  open,
  onOpenChange,
  debt,
  prefill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  debt?: Debt
  prefill?: ProposedDebt
}) {
  const userId = useCurrentUserId()
  const addDebt = useAddDebt()
  const updateDebt = useUpdateDebt()
  const isEdit = Boolean(debt)
  const isPending = addDebt.isPending || updateDebt.isPending

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [hint, setHint] = useState('')
  const [isAssisting, setIsAssisting] = useState(false)
  const [draftNote, setDraftNote] = useState<DebtDraft | null>(null)

  useEffect(() => {
    if (!open) return
    if (debt) {
      setForm({
        title: debt.title,
        creditor: debt.creditor,
        principalAmount: String(debt.principal_amount),
        currentBalance: String(debt.current_balance),
        interestRate: debt.interest_rate != null ? String(debt.interest_rate) : '',
        minimumPayment: String(debt.minimum_payment),
        dueDay: debt.due_day != null ? String(debt.due_day) : '',
        status: debt.status,
        notes: debt.notes ?? '',
      })
    } else if (prefill) {
      setForm({
        ...EMPTY_FORM,
        title: prefill.title,
        creditor: prefill.creditor,
        principalAmount: prefill.principal_amount != null ? String(prefill.principal_amount) : '',
        currentBalance: prefill.current_balance != null ? String(prefill.current_balance) : '',
        interestRate: prefill.interest_rate != null ? String(prefill.interest_rate) : '',
        minimumPayment: prefill.minimum_payment != null ? String(prefill.minimum_payment) : '',
        dueDay: prefill.due_day != null ? String(prefill.due_day) : '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setHint('')
    setDraftNote(null)
  }, [open, debt, prefill])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleAiAssist(file: File) {
    setIsAssisting(true)
    try {
      const imageBase64 = await fileToBase64(file)
      const draft = await assistDebtDraft({ imageBase64, mediaType: file.type || 'image/jpeg', textHint: hint.trim() || undefined })
      setForm((f) => ({
        title: draft.title || f.title,
        creditor: draft.creditor || f.creditor,
        principalAmount: draft.principal_amount != null ? String(draft.principal_amount) : f.principalAmount,
        currentBalance: draft.current_balance != null ? String(draft.current_balance) : f.currentBalance,
        interestRate: draft.interest_rate != null ? String(draft.interest_rate) : f.interestRate,
        minimumPayment: draft.minimum_payment != null ? String(draft.minimum_payment) : f.minimumPayment,
        dueDay: draft.due_day != null ? String(draft.due_day) : f.dueDay,
        status: f.status,
        notes: f.notes,
      }))
      setDraftNote(draft)
      toast.success('Черновик заполнен — проверь перед сохранением')
    } catch {
      toast.error('Не удалось разобрать — заполни вручную')
    } finally {
      setIsAssisting(false)
    }
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.creditor.trim()) {
      toast.error('Укажи название и кредитора')
      return
    }
    const principal = Number(form.principalAmount)
    if (!principal || principal <= 0) {
      toast.error('Укажи сумму долга больше нуля')
      return
    }

    const payload = {
      title: form.title.trim(),
      creditor: form.creditor.trim(),
      principal_amount: principal,
      current_balance: form.currentBalance ? Number(form.currentBalance) : principal,
      currency: 'KZT',
      interest_rate: form.interestRate ? Number(form.interestRate) : null,
      minimum_payment: Number(form.minimumPayment) || 0,
      due_day: form.dueDay ? Number(form.dueDay) : null,
      status: form.status,
      notes: form.notes.trim() || null,
    }

    if (isEdit && debt) {
      await updateDebt.mutateAsync({ id: debt.id, patch: payload })
      toast.success('Долг обновлён')
    } else {
      await addDebt.mutateAsync({ ...payload, owner_user_id: userId, created_at: new Date().toISOString() })
      toast.success('Долг добавлен')
    }
    onOpenChange(false)
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Редактировать долг' : 'Новый долг'}
      footer={
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
          <SaveButton pending={isPending} pendingLabel="Сохраняю…">
            {isEdit ? 'Сохранить изменения' : 'Добавить долг'}
          </SaveButton>
        </form>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleAiAssist(file)
          e.target.value = ''
        }}
      />
      <div className="space-y-2 rounded-[14px] border border-hf-line bg-hf-card p-3">
        <div className="flex items-center gap-2">
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Уточнение, напр. «Kaspi Bank» (необязательно)"
            className={formInputClass + ' min-w-0 flex-1 bg-hf-bar'}
          />
          <button
            type="button"
            disabled={isAssisting}
            onClick={() => fileInputRef.current?.click()}
            className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-hf-bar px-3 py-2.5 text-[13px] text-hf-accent-on-dark disabled:opacity-50"
          >
            {isAssisting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {isAssisting ? 'Разбираю…' : 'Скриншот'}
          </button>
        </div>
        <p className="text-[11px] leading-snug text-hf-text-4">
          Загрузи скриншот кредита — заполню поля ниже. Запускается только по кнопке, ничего не сохраняет само.
        </p>
        {draftNote && <p className="text-[11px] leading-snug text-hf-accent-on-dark">{draftNote.source_note}</p>}
      </div>

      <FormField label="Название">
        <input value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Кредит на авто" className={formInputClass} />
      </FormField>
      <FormField label="Кредитор">
        <input value={form.creditor} onChange={(e) => update('creditor', e.target.value)} placeholder="Kaspi Bank" className={formInputClass} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Сумма долга, ₸">
          <input type="number" inputMode="decimal" value={form.principalAmount} onChange={(e) => update('principalAmount', e.target.value)} placeholder="0" className={formInputClass} />
        </FormField>
        <FormField label="Остаток, ₸">
          <input
            type="number"
            inputMode="decimal"
            value={form.currentBalance}
            onChange={(e) => update('currentBalance', e.target.value)}
            placeholder={form.principalAmount || '0'}
            className={formInputClass}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Ставка, % годовых">
          <input type="number" inputMode="decimal" value={form.interestRate} onChange={(e) => update('interestRate', e.target.value)} placeholder="0" className={formInputClass} />
        </FormField>
        <FormField label="Мин. платёж, ₸">
          <input type="number" inputMode="decimal" value={form.minimumPayment} onChange={(e) => update('minimumPayment', e.target.value)} placeholder="0" className={formInputClass} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="День платежа">
          <input type="number" min={1} max={31} value={form.dueDay} onChange={(e) => update('dueDay', e.target.value)} placeholder="5" className={formInputClass} />
        </FormField>
        {isEdit && (
          <FormField label="Статус">
            <Segmented
              value={form.status}
              onChange={(v) => update('status', v)}
              options={[
                { value: 'active', label: 'Активен' },
                { value: 'closed', label: 'Закрыт' },
              ]}
            />
          </FormField>
        )}
      </div>
      <FormField label="Заметка (необязательно)">
        <input value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Например, беспроцентная рассрочка" className={formInputClass} />
      </FormField>
    </FormSheet>
  )
}
