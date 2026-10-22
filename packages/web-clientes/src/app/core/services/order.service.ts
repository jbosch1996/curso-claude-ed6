import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { API_URL } from '@resttek/web-shared'
import { Order } from '../models/order.model'

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = inject(API_URL)

  createOrder(
    restaurantId: string,
    items: { dishId: string; quantity: number; notes: string | null }[],
    tableId: string | null = null,
    packs: { packId: string; dishIds: string[]; quantity: number }[] = []
  ): Observable<Order> {
    return this.http.post<Order>(`${this.apiUrl}/orders`, {
      restaurantId,
      tableId,
      items,
      ...(packs.length > 0 ? { packs } : {})
    })
  }

  getMyOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.apiUrl}/orders/mine`)
  }

  getOrderById(id: string): Observable<Order> {
    return this.http.get<Order>(`${this.apiUrl}/orders/${id}`)
  }
}
