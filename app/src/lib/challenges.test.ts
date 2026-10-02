import { describe, expect, it } from 'vitest'
import { CHALLENGES, autoSpent, estimateSaving, milestoneLevel, pickChallenges, type ChallengeStats } from './challenges'

const stats = (over: Partial<ChallengeStats> = {}): ChallengeStats => ({ weekByCategory: {}, monthByCategory: {}, pauseThreshold: null, ...over })

describe('challenges', () => {
  it('всегда ровно два челленджа, даже без данных', () => {
    const picked = pickChallenges(stats())
    expect(picked).toHaveLength(2)
    expect(new Set(picked.map((c) => c.kind)).size).toBe(2)
  })

  it('берёт те, где больше всего экономии', () => {
    const picked = pickChallenges(stats({ weekByCategory: { 'Доставка еды': 24_000, 'Кофейни': 6_000 } }))
    expect(picked.map((c) => c.kind)).toEqual(['no_delivery', 'coffee_home'])
    expect(picked[0].est_saving).toBe(24_000)
    expect(picked[1].est_saving).toBe(3_000)
  })

  it('не предлагает те, что уже идут', () => {
    const picked = pickChallenges(stats({ weekByCategory: { 'Доставка еды': 24_000 }, activeKinds: ['no_delivery'] }))
    expect(picked.map((c) => c.kind)).not.toContain('no_delivery')
    expect(picked).toHaveLength(2)
  })

  it('нулевые траты: экономия 0, без NaN', () => {
    for (const k of Object.keys(CHALLENGES) as Array<keyof typeof CHALLENGES>) expect(estimateSaving(k, stats())).toBe(0)
  })

  it('пауза 72 ч оценивается от порога', () => {
    expect(estimateSaving('pause_72h', stats({ pauseThreshold: 40_000 }))).toBe(10_000)
    expect(estimateSaving('pause_72h', stats({ pauseThreshold: null }))).toBe(0)
  })

  it('автопрогресс считает траты по своим категориям после старта', () => {
    const e = [
      { amount: 5_000, spent_at: '2026-10-01', categoryName: 'Доставка еды' },
      { amount: 7_000, spent_at: '2026-10-03', categoryName: 'Доставка еды' },
      { amount: 9_000, spent_at: '2026-10-03', categoryName: 'Продукты' },
    ]
    expect(autoSpent('no_delivery', e, '2026-10-02T10:00:00Z')).toBe(7_000)
    expect(autoSpent('subscription_audit', e, '2026-10-02T10:00:00Z')).toBeNull()
  })

  it('вехи — каждые 10% погашенного', () => {
    expect(milestoneLevel(1_000_000, 1_000_000)).toBe(0)
    expect(milestoneLevel(1_000_000, 905_000)).toBe(0)
    expect(milestoneLevel(1_000_000, 800_000)).toBe(20)
    expect(milestoneLevel(1_000_000, 0)).toBe(100)
    expect(milestoneLevel(0, 0)).toBe(0)
    expect(milestoneLevel(1_000_000, 1_200_000)).toBe(0)
  })
})
