import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { DecimalPipe, DatePipe, NgClass } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { LucideAngularModule } from 'lucide-angular'
import { OrderService } from '../../core/services/order.service'
import { BillService } from '../../core/services/bill.service'
import { Order, OrderItem } from '../../core/models/order.model'
import { Bill, LoyaltySummary } from '../../core/models/bill.model'

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, DecimalPipe, DatePipe, NgClass, LucideAngularModule],
  template: `
    <div class="container">
      @if (loading()) {
        <div class="spinner"></div>
      } @else if (error()) {
        <div class="alert-error">{{ error() }}</div>
      } @else if (order()) {
        <div class="page-header">
          <div>
            <a routerLink="/orders" class="back-link">← Volver a mis pedidos</a>
            <h1>Pedido #{{ order()!.id.substring(0, 8) }}</h1>
            <p class="order-date">{{ order()!.createdAt | date:'dd/MM/yyyy HH:mm' }}</p>
          </div>
        </div>

        <div class="ticket card">
          <div class="ticket-header">
            @if (order()!.restaurantLogoUrl) {
              <img [src]="order()!.restaurantLogoUrl" [alt]="order()!.restaurantName" class="ticket-logo">
            } @else {
              <lucide-icon name="utensils" [size]="24"></lucide-icon>
            }
            <span>{{ order()!.restaurantName || 'RestTek' }}</span>
          </div>
          
          <div class="ticket-divider"></div>

          <div class="ticket-items">
            @for (group of groupedItems(); track group.dishId) {
              <div class="ticket-item">
                <div class="item-main">
                  <span class="item-qty">{{ group.count }}x</span>
                  <span class="item-name">{{ group.dishName || 'Plato' }}</span>
                </div>
                <div class="item-status">
                  <div class="status-badges">
                    @for (sc of group.statusCounts; track sc.status) {
                      <span class="status-badge" [ngClass]="getStatusClass(sc.status)">
                        {{ sc.count }}x {{ sc.status === 'pendiente' ? 'Pendiente' : sc.status === 'preparando' ? 'Preparando' : sc.status === 'listo' ? 'Listo' : 'Entregado' }}
                      </span>
                    }
                  </div>
                  <span class="item-price">{{ (group.dishPrice || 0) * group.count | number:'1.2-2' }} €</span>
                </div>
              </div>
            }
          </div>

          <div class="ticket-divider"></div>

          @if (bill(); as b) {
            <div class="ticket-bill">
              <div class="bill-row">
                <span>Subtotal</span>
                <span>{{ b.subtotal | number:'1.2-2' }} €</span>
              </div>
              @if (b.codeDiscount > 0) {
                <div class="bill-row bill-discount">
                  <span>Código de descuento</span>
                  <span>-{{ b.codeDiscount | number:'1.2-2' }} €</span>
                </div>
              }
              @if (b.pointsUsed > 0) {
                <div class="bill-row bill-discount">
                  <span>Puntos canjeados ({{ b.pointsUsed }})</span>
                  <span>-{{ b.pointsDiscount | number:'1.2-2' }} €</span>
                </div>
              }
            </div>
            <div class="ticket-total">
              <span>Total</span>
              <strong>{{ b.total | number:'1.2-2' }} €</strong>
            </div>
            @if (b.pointsEarned > 0) {
              <p class="points-earned">Has ganado {{ b.pointsEarned }} puntos con esta cuenta.</p>
            }
          } @else {
            <div class="ticket-total">
              <span>Total</span>
              <strong>{{ getTotal() | number:'1.2-2' }} €</strong>
            </div>
          }
        </div>

        @if (!bill()) {
          <form class="card bill-panel" (ngSubmit)="requestBill()">
            <h2>Pedir la cuenta</h2>

            @if (billError()) {
              <div class="alert-error">{{ billError() }}</div>
            }

            <div class="form-group">
              <label for="discountCode">Código de descuento (opcional)</label>
              <input id="discountCode" type="text" class="form-control" [(ngModel)]="discountCode" name="discountCode" maxlength="30" placeholder="VERANO10" autocomplete="off" />
            </div>

            @if (loyalty() && loyalty()!.rules.length > 0) {
              <div class="form-group">
                <label for="pointsRule">Canjear puntos (tu saldo: {{ loyalty()!.balance }} puntos)</label>
                <select id="pointsRule" class="form-control" [(ngModel)]="pointsRuleId" name="pointsRuleId">
                  <option value="">No canjear puntos</option>
                  @for (r of loyalty()!.rules; track r.id) {
                    <option [value]="r.id" [disabled]="r.points > loyalty()!.balance">
                      {{ r.points }} puntos = {{ r.discount | number:'1.2-2' }} € de descuento
                    </option>
                  }
                </select>
              </div>
            }

            <button type="submit" class="btn btn-primary" [disabled]="requestingBill()">
              {{ requestingBill() ? 'Pidiendo la cuenta...' : 'Pedir la cuenta' }}
            </button>
          </form>
        }
      }
    </div>
  `,
  styles: [`
    .container {
      max-width: 500px;
      margin: 0 auto;
    }
    .back-link {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 8px;
      display: inline-block;
    }
    .order-date {
      color: var(--text-muted);
      font-size: 14px;
      margin-top: 4px;
    }
    .ticket {
      background: var(--bg-card);
      padding: 24px;
      font-family: 'Courier New', monospace;
    }
    .ticket-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--green-light);
      font-size: 18px;
      font-weight: 700;
    }
    .ticket-logo {
      width: 24px;
      height: 24px;
      object-fit: contain;
    }
    .ticket-divider {
      border-top: 1px dashed var(--border-color);
      margin: 20px 0;
    }
    .ticket-items {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ticket-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .item-main {
      display: flex;
      gap: 8px;
    }
    .item-qty {
      color: var(--text-muted);
      min-width: 30px;
    }
    .item-name {
      color: var(--text-primary);
    }
    .item-status {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-left: 38px;
      gap: 8px;
    }
    .status-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .status-badge {
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-family: 'Inter', sans-serif;
    }
    .status-pendiente {
      background: rgba(250, 204, 21, 0.15);
      color: var(--yellow);
    }
    .status-preparando {
      background: rgba(59, 130, 246, 0.15);
      color: #3b82f6;
    }
    .status-listo {
      background: var(--green-glow);
      color: var(--green-light);
    }
    .status-entregado {
      background: rgba(139, 146, 168, 0.1);
      color: var(--text-secondary);
    }
    .item-price {
      color: var(--text-secondary);
      font-size: 13px;
    }
    .ticket-total {
      display: flex;
      justify-content: space-between;
      font-size: 18px;
      font-weight: 700;
    }
    .ticket-bill {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 14px;
      color: var(--text-secondary);
      font-size: 14px;
    }
    .bill-row {
      display: flex;
      justify-content: space-between;
    }
    .bill-discount {
      color: var(--green-light);
    }
    .points-earned {
      margin-top: 14px;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      color: var(--text-muted);
      text-align: center;
    }
    .bill-panel {
      margin-top: 20px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .bill-panel h2 {
      font-size: 16px;
    }
  `]
})
export class OrderDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute)
  private readonly orderService = inject(OrderService)
  private readonly billService = inject(BillService)
  private billLoaded = false
  private pollInterval: ReturnType<typeof setInterval> | null = null

  readonly order = signal<Order | null>(null)
  readonly loading = signal(true)
  readonly error = signal<string | null>(null)

  readonly bill = signal<Bill | null>(null)
  readonly loyalty = signal<LoyaltySummary | null>(null)
  readonly requestingBill = signal(false)
  readonly billError = signal<string | null>(null)
  discountCode = ''
  pointsRuleId = ''

  ngOnInit(): void {
    const orderId = this.route.snapshot.paramMap.get('id')!
    this.loadOrder(orderId)
    this.pollInterval = setInterval(() => this.loadOrder(orderId, false), 5000)
  }

  ngOnDestroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
    }
  }

  private loadOrder(orderId: string, showLoading = true): void {
    if (showLoading) this.loading.set(true)
    this.orderService.getOrderById(orderId).subscribe({
      next: (order) => {
        this.order.set(order)
        this.loading.set(false)
        if (!this.billLoaded) {
          this.billLoaded = true
          this.loadBill(order)
        }
      },
      error: () => {
        this.error.set('Error al cargar el pedido')
        this.loading.set(false)
      }
    })
  }

  private loadBill(order: Order): void {
    this.billService.getBill(order.id).subscribe({
      next: (bill) => this.bill.set(bill),
      error: (err) => {
        // 404: aún no se ha pedido la cuenta; se ofrece el panel con el saldo de puntos.
        if (err?.status === 404) {
          this.billService.getLoyalty(order.restaurantId).subscribe({
            next: (summary) => this.loyalty.set(summary),
            error: () => this.loyalty.set(null)
          })
        }
      }
    })
  }

  requestBill(): void {
    const order = this.order()
    if (!order || this.requestingBill()) return

    const dto: { discountCode?: string; pointsRuleId?: string } = {}
    if (this.discountCode.trim()) dto.discountCode = this.discountCode.trim()
    if (this.pointsRuleId) dto.pointsRuleId = this.pointsRuleId

    this.requestingBill.set(true)
    this.billError.set(null)
    this.billService.requestBill(order.id, dto).subscribe({
      next: (bill) => {
        this.bill.set(bill)
        this.requestingBill.set(false)
      },
      error: (err) => {
        this.billError.set(this.getBillErrorMessage(err?.error?.error))
        this.requestingBill.set(false)
        if (err?.error?.error === 'BillAlreadyRequestedError') {
          this.billService.getBill(order.id).subscribe({ next: (bill) => this.bill.set(bill) })
        }
      }
    })
  }

  private getBillErrorMessage(errorName: string | undefined): string {
    const messages: Record<string, string> = {
      InvalidDiscountCodeError: 'El código de descuento no es válido o ha caducado.',
      InsufficientPointsError: 'No tienes puntos suficientes para ese canje.',
      PointsRuleNotFoundError: 'Ese canje de puntos ya no está disponible.',
      InvalidBillError: 'El descuento por puntos supera el importe que queda por pagar.',
      BillAlreadyRequestedError: 'La cuenta de este pedido ya se había pedido.'
    }
    return (errorName && messages[errorName]) || 'No se pudo pedir la cuenta. Inténtalo de nuevo.'
  }

  getTotal(): number {
    const o = this.order()
    if (!o) return 0
    return o.items.reduce((sum, item) => sum + (item.dishPrice || 0) * item.quantity, 0)
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pendiente: 'Pendiente',
      preparando: 'Preparando',
      listo: 'Listo',
      entregado: 'Entregado'
    }
    return labels[status] || status
  }

  getStatusClass(status: string): string {
    return 'status-' + status
  }

  getStatusString(status: string | { value: string }): string {
    if (typeof status === 'string') {
      return status
    }
    return status?.value || 'pendiente'
  }

  groupedItems = computed(() => {
    const items = this.order()?.items || []
    const groups = new Map<string, { dishId: string; dishName: string; dishPrice: number; statusCounts: { status: string; count: number }[] }>()

    for (const item of items) {
      const itemStatus = this.getStatusString(item.status)
      const key = item.dishId
      const existing = groups.get(key)

      if (existing) {
        const statusIdx = existing.statusCounts.findIndex(s => s.status === itemStatus)
        if (statusIdx >= 0) {
          existing.statusCounts[statusIdx].count++
        } else {
          existing.statusCounts.push({ status: itemStatus, count: 1 })
        }
      } else {
        groups.set(key, {
          dishId: item.dishId,
          dishName: item.dishName || 'Plato',
          dishPrice: item.dishPrice || 0,
          statusCounts: [{ status: itemStatus, count: 1 }]
        })
      }
    }

    return Array.from(groups.values()).map(group => ({
      ...group,
      count: group.statusCounts.reduce((sum, s) => sum + s.count, 0)
    }))
  })
}
