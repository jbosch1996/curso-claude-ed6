export type DiscountType = 'percent' | 'fixed'

export interface DiscountCode {
  id: string
  restaurantId: string
  code: string
  type: DiscountType
  value: number
  expiresAt: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateDiscountCodeDto {
  code: string
  type: DiscountType
  value: number
  expiresAt: string | null
  active: boolean
}

export interface PointsRule {
  id: string
  restaurantId: string
  points: number
  discount: number
  createdAt: string
}

export interface CreatePointsRuleDto {
  points: number
  discount: number
}

export interface PointsEarningRate {
  restaurantId: string
  amount: number
  points: number
  isDefault: boolean
  updatedAt: string | null
}

export interface UpdatePointsEarningDto {
  amount: number
  points: number
}
