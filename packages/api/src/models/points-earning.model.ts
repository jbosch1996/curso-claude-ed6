import { InvalidPointsEarningError } from '@errors/DomainErrors.js'

const MAX_AMOUNT = 10000
const MAX_POINTS = 10000

// No importa roundMoney de bill.model para no crear un ciclo (bill.model usa DEFAULT_POINTS_EARNING).

export interface PointsEarningRate {
    restaurantId: string
    amount: number
    points: number
    isDefault: boolean
    updatedAt: string | null
}

// Sin configuración, un restaurante da 1 punto por cada euro pagado.
export const DEFAULT_POINTS_EARNING = { amount: 1, points: 1 }

export function validatePointsEarning(props: { amount: unknown; points: unknown }): { amount: number; points: number } {
    const amount = typeof props.amount === 'number' && Number.isFinite(props.amount) ? Math.round(props.amount * 100) / 100 : 0
    if (amount <= 0 || amount > MAX_AMOUNT) {
        throw new InvalidPointsEarningError(`Amount must be a positive number up to ${MAX_AMOUNT} with at most 2 decimals`)
    }
    if (!Number.isInteger(props.points) || (props.points as number) <= 0 || (props.points as number) > MAX_POINTS) {
        throw new InvalidPointsEarningError(`Points must be a positive integer up to ${MAX_POINTS}`)
    }
    return { amount, points: props.points as number }
}
