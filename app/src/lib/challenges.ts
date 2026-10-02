// Тип дублирует domain.ts — файл не должен импортировать ничего, чтобы работать и в Deno.
type ChallengeKind = 'no_delivery' | 'subscription_audit' | 'coffee_home' | 'pause_72h'

/**
 * Каталог челленджей недели (10) и подбор двух под данные пользователя. Чистые
 * функции без зависимостей: такая же копия лежит в supabase/functions/_shared/,
 * cron разбора недели выбирает челленджи тем же кодом, что показывает клиент.
 */

export interface ChallengeDef {
  kind: ChallengeKind
  title: string
  /** Сколько дней длится. */
  days: number
  /** Как понимать «получилось». */
  rule: string
  /** Прогресс считается по тратам сам (true) или отмечается вручную. */
  auto: boolean
}

export const CHALLENGES: Record<ChallengeKind, ChallengeDef> = {
  no_delivery: { kind: 'no_delivery', title: 'Без доставки неделю', days: 7, rule: 'Ни одного заказа еды на дом за семь дней.', auto: true },
  subscription_audit: { kind: 'subscription_audit', title: 'Аудит подписок', days: 7, rule: 'Пройди по подпискам и отключи те, которыми не пользовался месяц.', auto: false },
  coffee_home: { kind: 'coffee_home', title: 'Кофе дома ×3', days: 7, rule: 'Три раза за неделю — кофе из дома вместо кофейни.', auto: false },
  pause_72h: { kind: 'pause_72h', title: 'Пауза 72 ч', days: 7, rule: 'Любая покупка дороже порога ждёт 72 часа, прежде чем ты её сделаешь.', auto: false },
}

/** Названия категорий, по которым челленджи ищут «свои» траты. */
const MATCH: Partial<Record<ChallengeKind, RegExp>> = {
  no_delivery: /достав|ресторан|кафе|фастфуд|еда вне|общепит|яндекс\s*еда|glovo/i,
  coffee_home: /кофе|кафе|кофейн/i,
  subscription_audit: /подписк|сервис|стриминг|музык/i,
}

export interface ChallengeStats {
  /** Траты за последние 7 дней по названию категории. */
  weekByCategory: Record<string, number>
  /** Траты за последние 30 дней по названию категории. */
  monthByCategory: Record<string, number>
  /** Порог паузы перед покупкой из настроек, если включён. */
  pauseThreshold: number | null
  /** Какие челленджи уже идут — их не предлагаем второй раз. */
  activeKinds?: ChallengeKind[]
}

const sumMatching = (by: Record<string, number>, re: RegExp | undefined) =>
  re ? Object.entries(by).reduce((s, [name, v]) => (re.test(name) ? s + v : s), 0) : 0

const round1000 = (n: number) => Math.round(n / 500) * 500

/** Сколько человек сэкономит, если выполнит челлендж (оценка по его же тратам; 0 — нет данных). */
export function estimateSaving(kind: ChallengeKind, stats: ChallengeStats): number {
  switch (kind) {
    case 'no_delivery':
      return round1000(sumMatching(stats.weekByCategory, MATCH.no_delivery))
    case 'coffee_home':
      return round1000(sumMatching(stats.weekByCategory, MATCH.coffee_home) * 0.5)
    case 'subscription_audit':
      return round1000(sumMatching(stats.monthByCategory, MATCH.subscription_audit) * 0.3)
    case 'pause_72h':
      return stats.pauseThreshold ? round1000(stats.pauseThreshold * 0.25) : 0
  }
}

/** Два челленджа с наибольшей оценкой экономии; без данных — осмысленный набор по умолчанию. Ровно два. */
export function pickChallenges(stats: ChallengeStats): Array<{ kind: ChallengeKind; est_saving: number }> {
  const taken = new Set(stats.activeKinds ?? [])
  const all = (Object.keys(CHALLENGES) as ChallengeKind[])
    .filter((k) => !taken.has(k))
    .map((kind) => ({ kind, est_saving: estimateSaving(kind, stats) }))
  const ranked = [...all].sort((a, b) => b.est_saving - a.est_saving)
  const withData = ranked.filter((c) => c.est_saving > 0)
  // Если данных меньше чем на два челленджа — добиваем из каталога в порядке «аудит, пауза, кофе, доставка».
  const fallbackOrder: ChallengeKind[] = ['subscription_audit', 'pause_72h', 'coffee_home', 'no_delivery']
  const rest = fallbackOrder.map((k) => all.find((c) => c.kind === k)).filter((c): c is { kind: ChallengeKind; est_saving: number } => !!c && !withData.includes(c))
  return [...withData, ...rest].slice(0, 2)
}

/** Для авто-челленджа: сколько потрачено на «свои» категории с начала. null — прогресс ручной. */
export function autoSpent(kind: ChallengeKind, expenses: Array<{ amount: number; spent_at: string; categoryName: string | null }>, startedAt: string): number | null {
  const re = MATCH[kind]
  if (!CHALLENGES[kind].auto || !re) return null
  const since = startedAt.slice(0, 10)
  return expenses.reduce((s, e) => (e.spent_at >= since && e.categoryName && re.test(e.categoryName) ? s + e.amount : s), 0)
}

/** Веха погашения: каждые 10% от начальной суммы долгов. 0 — ещё нет; 10 — до 100. */
export function milestoneLevel(principal: number, balance: number): number {
  if (!(principal > 0)) return 0
  const paidPct = ((principal - Math.max(0, balance)) / principal) * 100
  return Math.max(0, Math.min(10, Math.floor(paidPct / 10))) * 10
}
