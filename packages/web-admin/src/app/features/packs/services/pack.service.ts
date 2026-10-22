import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { environment } from '../../../../environments/environment'
import type { Pack, CreatePackDto, UpdatePackDto } from '../models/pack.model'

@Injectable({ providedIn: 'root' })
export class PackService {
  private readonly http = inject(HttpClient)

  private buildUrl(restaurantId: string): string {
    return `${environment.apiUrl}/restaurants/${restaurantId}/packs`
  }

  getAll(restaurantId: string) {
    return this.http.get<Pack[]>(this.buildUrl(restaurantId))
  }

  getById(restaurantId: string, id: string) {
    return this.http.get<Pack>(`${this.buildUrl(restaurantId)}/${id}`)
  }

  create(restaurantId: string, dto: CreatePackDto) {
    return this.http.post<Pack>(this.buildUrl(restaurantId), dto)
  }

  update(restaurantId: string, id: string, dto: UpdatePackDto) {
    return this.http.put<Pack>(`${this.buildUrl(restaurantId)}/${id}`, dto)
  }

  delete(restaurantId: string, id: string) {
    return this.http.delete<void>(`${this.buildUrl(restaurantId)}/${id}`)
  }
}
