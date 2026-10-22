import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { AuthStore } from '@resttek/web-shared';
import { TableStore } from '../../store/table.store';
import { OrderStore } from '../../../orders/store/order.store';
import { RestaurantTable, TableStatus } from '../../models/table.model';

@Component({
  selector: 'app-mesas',
  standalone: true,
  templateUrl: './mesas.component.html',
  styleUrl: './mesas.component.css'
})
export class MesasComponent implements OnInit, OnDestroy {
  private readonly authStore = inject(AuthStore);
  readonly tableStore = inject(TableStore);
  readonly orderStore = inject(OrderStore);

  readonly statuses: { value: TableStatus; label: string }[] = [
    { value: 'libre', label: 'Libre' },
    { value: 'ocupada', label: 'Ocupada' },
    { value: 'reservada', label: 'Reservada' }
  ];

  ngOnInit(): void {
    const restaurantId = this.authStore.user()?.restaurantId;
    if (restaurantId) {
      this.tableStore.startPolling(restaurantId);
      this.orderStore.startPolling(restaurantId);
    }
  }

  ngOnDestroy(): void {
    this.tableStore.stopPolling();
    this.orderStore.stopPolling();
  }

  onStatusChange(table: RestaurantTable, event: Event): void {
    const restaurantId = this.authStore.user()?.restaurantId;
    const status = (event.target as HTMLSelectElement).value as TableStatus;
    if (restaurantId && status !== table.status) {
      this.tableStore.updateStatus(restaurantId, table.id, status);
    }
  }

  ordersOf(table: RestaurantTable) {
    return this.orderStore.orders().filter(order => order.tableId === table.id);
  }

  getStatusClass(status: string): string {
    return `badge badge-${status}`;
  }
}
