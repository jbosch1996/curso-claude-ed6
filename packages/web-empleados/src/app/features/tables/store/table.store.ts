import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RestaurantTable, TableStatus } from '../models/table.model';
import { TableService } from '../services/table.service';

@Injectable({ providedIn: 'root' })
export class TableStore {
  private readonly tableService = inject(TableService);

  private readonly _tables = signal<RestaurantTable[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  readonly tables = this._tables.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  async loadTables(restaurantId: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      this._tables.set(await firstValueFrom(this.tableService.getAll(restaurantId)));
    } catch (err: any) {
      this._error.set(err.message || 'Error al cargar las mesas');
    } finally {
      this._loading.set(false);
    }
  }

  async updateStatus(restaurantId: string, id: string, status: TableStatus): Promise<void> {
    const previous = this._tables().find(t => t.id === id)?.status;
    this.setLocalStatus(id, status);
    try {
      await firstValueFrom(this.tableService.updateStatus(restaurantId, id, status));
    } catch (err: any) {
      if (previous) this.setLocalStatus(id, previous);
      this._error.set(err?.error?.message || 'Error al cambiar el estado de la mesa');
    }
  }

  startPolling(restaurantId: string): void {
    this.stopPolling();
    this.loadTables(restaurantId);
    this.pollingInterval = setInterval(() => {
      this.loadTables(restaurantId);
    }, 30000);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private setLocalStatus(id: string, status: TableStatus): void {
    this._tables.update(tables => tables.map(t => t.id === id ? { ...t, status } : t));
  }
}
