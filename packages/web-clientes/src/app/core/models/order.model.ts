export interface OrderItem {
  id: string
  dishId: string
  quantity: number
  notes: string | null
  status: string
  dishName?: string
  dishPrice?: number
  packId?: string
  packName?: string
  packInstanceId?: string
}

export interface Order {
  id: string
  restaurantId: string
  restaurantName?: string
  restaurantLogoUrl?: string | null
  tableId: string | null
  clientId: string | null
  createdAt: string
  items: OrderItem[]
}
