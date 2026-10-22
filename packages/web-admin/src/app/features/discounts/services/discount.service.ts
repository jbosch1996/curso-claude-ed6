import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { environment } from '../../../../environments/environment'
import type { DiscountCode, CreateDiscountCodeDto, PointsRule, CreatePointsRuleDto } from '../models/discount.model'

@Injectable({ providedIn: 'root' })
export class DiscountService {
  private readonly http = inject(HttpClient)

  private codesUrl(restaurantId: string): string {
    return `${environment.apiUrl}/restaurants/${restaurantId}/discount-codes`
  }

  private rulesUrl(restaurantId: string): string {
    return `${environment.apiUrl}/restaurants/${restaurantId}/points-rules`
  }

  getCodes(restaurantId: string) {
    return this.http.get<DiscountCode[]>(this.codesUrl(restaurantId))
  }

  getCodeById(restaurantId: string, id: string) {
    return this.http.get<DiscountCode>(`${this.codesUrl(restaurantId)}/${id}`)
  }

  createCode(restaurantId: string, dto: CreateDiscountCodeDto) {
    return this.http.post<DiscountCode>(this.codesUrl(restaurantId), dto)
  }

  updateCode(restaurantId: string, id: string, dto: CreateDiscountCodeDto) {
    return this.http.put<DiscountCode>(`${this.codesUrl(restaurantId)}/${id}`, dto)
  }

  deleteCode(restaurantId: string, id: string) {
    return this.http.delete<void>(`${this.codesUrl(restaurantId)}/${id}`)
  }

  getRules(restaurantId: string) {
    return this.http.get<PointsRule[]>(this.rulesUrl(restaurantId))
  }

  createRule(restaurantId: string, dto: CreatePointsRuleDto) {
    return this.http.post<PointsRule>(this.rulesUrl(restaurantId), dto)
  }

  updateRule(restaurantId: string, id: string, dto: CreatePointsRuleDto) {
    return this.http.put<PointsRule>(`${this.rulesUrl(restaurantId)}/${id}`, dto)
  }

  deleteRule(restaurantId: string, id: string) {
    return this.http.delete<void>(`${this.rulesUrl(restaurantId)}/${id}`)
  }
}
