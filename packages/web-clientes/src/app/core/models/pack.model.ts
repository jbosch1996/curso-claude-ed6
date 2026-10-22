export interface PackDishOption {
  id: string
  name: string
  description: string | null
  price: number
}

export interface PackSlot {
  category: string
  dishes: PackDishOption[]
}

export interface PublicPack {
  id: string
  name: string
  description: string | null
  price: number
  slots: PackSlot[]
}
