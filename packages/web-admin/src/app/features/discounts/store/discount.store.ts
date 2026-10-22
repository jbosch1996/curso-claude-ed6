import { Injectable, inject, signal } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { DiscountService } from '../services/discount.service'
import type { DiscountCode, CreateDiscountCodeDto, PointsRule, CreatePointsRuleDto, PointsEarningRate, UpdatePointsEarningDto } from '../models/discount.model'

@Injectable({ providedIn: 'root' })
export class DiscountStore {
  private readonly service = inject(DiscountService)

  private readonly _codes = signal<DiscountCode[]>([])
  private readonly _rules = signal<PointsRule[]>([])
  private readonly _earning = signal<PointsEarningRate | null>(null)
  private readonly _loading = signal(false)
  private readonly _error = signal<string | null>(null)

  readonly codes = this._codes.asReadonly()
  readonly rules = this._rules.asReadonly()
  readonly earning = this._earning.asReadonly()
  readonly loading = this._loading.asReadonly()
  readonly error = this._error.asReadonly()

  async loadCodes(restaurantId: string): Promise<void> {
    this._loading.set(true)
    this._error.set(null)
    try {
      this._codes.set(await firstValueFrom(this.service.getCodes(restaurantId)))
    } catch {
      this._error.set('No se pudieron cargar los códigos de descuento.')
    } finally {
      this._loading.set(false)
    }
  }

  async createCode(restaurantId: string, dto: CreateDiscountCodeDto): Promise<void> {
    const code = await firstValueFrom(this.service.createCode(restaurantId, dto))
    this._codes.update(list => [...list, code])
  }

  async updateCode(restaurantId: string, id: string, dto: CreateDiscountCodeDto): Promise<void> {
    const updated = await firstValueFrom(this.service.updateCode(restaurantId, id, dto))
    this._codes.update(list => list.map(c => c.id === id ? updated : c))
  }

  async deleteCode(restaurantId: string, id: string): Promise<void> {
    await firstValueFrom(this.service.deleteCode(restaurantId, id))
    this._codes.update(list => list.filter(c => c.id !== id))
  }

  async loadRules(restaurantId: string): Promise<void> {
    this._loading.set(true)
    this._error.set(null)
    try {
      this._rules.set(await firstValueFrom(this.service.getRules(restaurantId)))
    } catch {
      this._error.set('No se pudieron cargar las equivalencias de puntos.')
    } finally {
      this._loading.set(false)
    }
  }

  async createRule(restaurantId: string, dto: CreatePointsRuleDto): Promise<void> {
    const rule = await firstValueFrom(this.service.createRule(restaurantId, dto))
    this._rules.update(list => [...list, rule].sort((a, b) => a.points - b.points))
  }

  async updateRule(restaurantId: string, id: string, dto: CreatePointsRuleDto): Promise<void> {
    const updated = await firstValueFrom(this.service.updateRule(restaurantId, id, dto))
    this._rules.update(list => list.map(r => r.id === id ? updated : r).sort((a, b) => a.points - b.points))
  }

  async deleteRule(restaurantId: string, id: string): Promise<void> {
    await firstValueFrom(this.service.deleteRule(restaurantId, id))
    this._rules.update(list => list.filter(r => r.id !== id))
  }

  async loadEarning(restaurantId: string): Promise<void> {
    this._earning.set(await firstValueFrom(this.service.getEarning(restaurantId)))
  }

  async updateEarning(restaurantId: string, dto: UpdatePointsEarningDto): Promise<void> {
    this._earning.set(await firstValueFrom(this.service.updateEarning(restaurantId, dto)))
  }
}
