export interface Bill {
  id: string
  orderId: string
  restaurantId: string
  clientId: string
  subtotal: number
  discountCodeId: string | null
  codeDiscount: number
  pointsUsed: number
  pointsDiscount: number
  total: number
  pointsEarned: number
  createdAt: string
}

export interface PointsRule {
  id: string
  points: number
  discount: number
}

export interface LoyaltySummary {
  balance: number
  rules: PointsRule[]
}

export interface RequestBillDto {
  discountCode?: string
  pointsRuleId?: string
}
