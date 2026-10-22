import { Injectable, inject, signal } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { PackService } from '../services/pack.service'
import type { Pack, CreatePackDto, UpdatePackDto } from '../models/pack.model'

const byName = (a: Pack, b: Pack) => a.name.localeCompare(b.name)

@Injectable({ providedIn: 'root' })
export class PackStore {
  private readonly service = inject(PackService)

  private readonly _packs = signal<Pack[]>([])
  private readonly _loading = signal(false)
  private readonly _error = signal<string | null>(null)

  readonly packs = this._packs.asReadonly()
  readonly loading = this._loading.asReadonly()
  readonly error = this._error.asReadonly()

  async loadByRestaurant(restaurantId: string): Promise<void> {
    this._loading.set(true)
    this._error.set(null)
    try {
      this._packs.set(await firstValueFrom(this.service.getAll(restaurantId)))
    } catch {
      this._error.set('No se pudieron cargar los packs.')
    } finally {
      this._loading.set(false)
    }
  }

  async create(restaurantId: string, dto: CreatePackDto): Promise<void> {
    const pack = await firstValueFrom(this.service.create(restaurantId, dto))
    this._packs.update(list => [...list, pack].sort(byName))
  }

  async update(restaurantId: string, id: string, dto: UpdatePackDto): Promise<void> {
    const updated = await firstValueFrom(this.service.update(restaurantId, id, dto))
    this._packs.update(list => list.map(p => p.id === id ? updated : p).sort(byName))
  }

  async delete(restaurantId: string, id: string): Promise<void> {
    await firstValueFrom(this.service.delete(restaurantId, id))
    this._packs.update(list => list.filter(p => p.id !== id))
  }
}
