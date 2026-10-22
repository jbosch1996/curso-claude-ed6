import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { API_URL } from '@resttek/web-shared'
import { PublicPack } from '../models/pack.model'

@Injectable({ providedIn: 'root' })
export class PackService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = inject(API_URL)

  getByRestaurant(restaurantId: string): Observable<PublicPack[]> {
    return this.http.get<PublicPack[]>(`${this.apiUrl}/public/restaurants/${restaurantId}/packs`)
  }
}
