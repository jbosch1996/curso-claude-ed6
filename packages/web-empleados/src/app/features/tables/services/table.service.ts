import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RestaurantTable, TableStatus } from '../models/table.model';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient);

  private buildUrl(restaurantId: string): string {
    return `${environment.apiUrl}/restaurants/${restaurantId}/tables`;
  }

  getAll(restaurantId: string): Observable<RestaurantTable[]> {
    return this.http.get<RestaurantTable[]>(this.buildUrl(restaurantId));
  }

  updateStatus(restaurantId: string, id: string, status: TableStatus): Observable<RestaurantTable> {
    return this.http.patch<RestaurantTable>(`${this.buildUrl(restaurantId)}/${id}/status`, { status });
  }
}
