import { assertPositiveNumber } from '@models/validation.js'
import { InvalidPointsRuleError } from '@errors/DomainErrors.js'
import { roundMoney } from '@models/bill.model.js'

export interface PointsRule {
    id: string
    restaurantId: string
    points: number
    discount: number
    createdAt: string
}

export function validatePointsRule(props: { points: unknown; discount: unknown }): { points: number; discount: number } {
    if (!Number.isInteger(props.points) || (props.points as number) <= 0) {
        throw new InvalidPointsRuleError('Points must be a positive integer')
    }
    assertPositiveNumber(props.discount, new InvalidPointsRuleError('Discount must be a positive number'))
    return { points: props.points as number, discount: roundMoney(props.discount as number) }
}
