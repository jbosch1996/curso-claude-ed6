import type { DishCategory } from '../../dishes/models/dish.model'

export interface Pack {
  id: string
  restaurantId: string
  name: string
  description: string | null
  price: number
  available: boolean
  categories: DishCategory[]
  excludedDishIds: string[]
  createdAt: string
  updatedAt: string
}

export interface CreatePackDto {
  name: string
  description: string | null
  price: number
  available: boolean
  categories: DishCategory[]
  excludedDishIds: string[]
}

export type UpdatePackDto = CreatePackDto
