import { Injectable, signal, computed } from '@angular/core'
import type { PublicPack, PackDishOption } from '../models/pack.model'

export interface Dish {
  id: string
  name: string
  description: string | null
  price: number
  category: string
  available: boolean
  restaurantId: string
  ingredients: { ingredientId: string; quantity: number }[]
}

export interface CartItem {
  dish: Dish
  quantity: number
  notes: string
}

export interface CartPack {
  /** Pack + platos elegidos: dos packs iguales con la misma elección comparten línea. */
  key: string
  pack: PublicPack
  dishes: PackDishOption[]
  quantity: number
}

@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly _items = signal<CartItem[]>([])
  private readonly _packs = signal<CartPack[]>([])
  private readonly _restaurantId = signal<string | null>(null)
  private readonly _tableRestaurantId = signal<string | null>(null)
  private readonly _tableId = signal<string | null>(null)
  private readonly _tableNumber = signal<number | null>(null)

  readonly items = this._items.asReadonly()
  readonly packs = this._packs.asReadonly()
  readonly restaurantId = this._restaurantId.asReadonly()
  readonly tableRestaurantId = this._tableRestaurantId.asReadonly()
  readonly tableId = this._tableId.asReadonly()
  readonly tableNumber = this._tableNumber.asReadonly()

  readonly total = computed(() =>
    this._items().reduce((sum, item) => sum + item.dish.price * item.quantity, 0)
    + this._packs().reduce((sum, line) => sum + line.pack.price * line.quantity, 0)
  )

  readonly itemCount = computed(() =>
    this._items().reduce((count, item) => count + item.quantity, 0)
    + this._packs().reduce((count, line) => count + line.quantity, 0)
  )

  readonly isEmpty = computed(() => this._items().length === 0 && this._packs().length === 0)

  setTable(restaurantId: string, table: { id: string; number: number }): void {
    this._tableRestaurantId.set(restaurantId)
    this._tableId.set(table.id)
    this._tableNumber.set(table.number)
  }

  hasTableFor(restaurantId: string): boolean {
    return this._tableId() !== null && this._tableRestaurantId() === restaurantId
  }

  /** Mesa ocupada por el cliente en ese restaurante, o null si ocupó otra o ninguna. */
  tableIdFor(restaurantId: string): string | null {
    return this.hasTableFor(restaurantId) ? this._tableId() : null
  }

  clearTable(): void {
    this._tableRestaurantId.set(null)
    this._tableId.set(null)
    this._tableNumber.set(null)
  }

  addItem(dish: Dish, quantity: number = 1, notes: string = ''): void {
    this.switchRestaurant(dish.restaurantId)

    const existingIndex = this._items().findIndex(
      item => item.dish.id === dish.id && item.notes === notes
    )

    if (existingIndex >= 0) {
      const items = [...this._items()]
      items[existingIndex] = {
        ...items[existingIndex],
        quantity: items[existingIndex].quantity + quantity
      }
      this._items.set(items)
    } else {
      this._items.update(items => [...items, { dish, quantity, notes }])
    }
  }

  removeItem(dishId: string): void {
    const items = this._items().filter(item => item.dish.id !== dishId)
    this._items.set(items)
    this.resetRestaurantIfEmpty()
  }

  addPack(restaurantId: string, pack: PublicPack, dishes: PackDishOption[], quantity: number = 1): void {
    this.switchRestaurant(restaurantId)
    const key = [pack.id, ...dishes.map(d => d.id)].join('|')
    const existing = this._packs().find(line => line.key === key)
    if (existing) {
      this.updatePackQuantity(key, existing.quantity + quantity)
    } else {
      this._packs.update(lines => [...lines, { key, pack, dishes, quantity }])
    }
  }

  updatePackQuantity(key: string, quantity: number): void {
    if (quantity <= 0) {
      this.removePack(key)
      return
    }
    this._packs.update(lines => lines.map(line => line.key === key ? { ...line, quantity } : line))
  }

  removePack(key: string): void {
    this._packs.update(lines => lines.filter(line => line.key !== key))
    this.resetRestaurantIfEmpty()
  }

  /** Al cambiar de restaurante se vacía el carrito (platos y packs) y se olvida la mesa. */
  private switchRestaurant(restaurantId: string): void {
    if (this._restaurantId() && this._restaurantId() !== restaurantId) {
      this._items.set([])
      this._packs.set([])
      this.clearTable()
    }
    this._restaurantId.set(restaurantId)
  }

  private resetRestaurantIfEmpty(): void {
    if (this.isEmpty()) {
      this._restaurantId.set(null)
    }
  }

  updateQuantity(dishId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeItem(dishId)
      return
    }
    const items = this._items().map(item =>
      item.dish.id === dishId ? { ...item, quantity } : item
    )
    this._items.set(items)
  }

  clear(): void {
    this._items.set([])
    this._packs.set([])
    this._restaurantId.set(null)
  }
}
