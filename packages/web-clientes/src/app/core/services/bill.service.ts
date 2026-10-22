import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { API_URL } from '@resttek/web-shared'
import { Bill, LoyaltySummary, RequestBillDto } from '../models/bill.model'

@Injectable({ providedIn: 'root' })
export class BillService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = inject(API_URL)

  requestBill(orderId: string, dto: RequestBillDto): Observable<Bill> {
    return this.http.post<Bill>(`${this.apiUrl}/orders/${orderId}/bill`, dto)
  }

  getBill(orderId: string): Observable<Bill> {
    return this.http.get<Bill>(`${this.apiUrl}/orders/${orderId}/bill`)
  }

  getLoyalty(restaurantId: string): Observable<LoyaltySummary> {
    return this.http.get<LoyaltySummary>(`${this.apiUrl}/loyalty/${restaurantId}`)
  }
}
