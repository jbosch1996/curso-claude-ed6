import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Observable } from 'rxjs'
import { API_URL } from '@resttek/web-shared'
import { AvailableTable } from '../models/table.model'

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = inject(API_URL)

  getAvailable(restaurantId: string, guests: number): Observable<AvailableTable[]> {
    const params = new HttpParams().set('guests', guests)
    return this.http.get<AvailableTable[]>(`${this.apiUrl}/restaurants/${restaurantId}/tables/available`, { params })
  }

  occupy(restaurantId: string, tableId: string, guests: number): Observable<AvailableTable> {
    return this.http.post<AvailableTable>(`${this.apiUrl}/restaurants/${restaurantId}/tables/${tableId}/occupy`, { guests })
  }
}
