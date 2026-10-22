export type TableStatus = 'libre' | 'ocupada' | 'reservada'

export interface RestaurantTable {
  id: string
  restaurantId: string
  number: number
  description: string | null
  capacity: number
  status: TableStatus
  createdAt: string
  updatedAt: string
}

export interface CreateTableDto {
  number: number
  description: string | null
  capacity: number
  status: TableStatus
}

export type UpdateTableDto = CreateTableDto
