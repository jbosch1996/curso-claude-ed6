import { Component, inject, OnInit } from '@angular/core'
import { DatePipe } from '@angular/common'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { LucideAngularModule } from 'lucide-angular'
import { DiscountStore } from '../../store/discount.store'
import type { DiscountCode } from '../../models/discount.model'

@Component({
  selector: 'app-discount-code-list',
  standalone: true,
  imports: [RouterLink, DatePipe, LucideAngularModule],
  templateUrl: './discount-code-list.component.html',
  styleUrl: './discount-code-list.component.css'
})
export class DiscountCodeListComponent implements OnInit {
  readonly store = inject(DiscountStore)
  private readonly route = inject(ActivatedRoute)
  restaurantId = ''

  ngOnInit(): void {
    this.restaurantId = this.route.parent?.snapshot.params['restaurantId'] ?? ''
    if (this.restaurantId) {
      this.store.loadCodes(this.restaurantId)
    }
  }

  async onDelete(id: string): Promise<void> {
    if (!this.restaurantId) return
    if (confirm('¿Estás seguro de eliminar este código de descuento?')) {
      try {
        await this.store.deleteCode(this.restaurantId, id)
      } catch {
        alert('Error al eliminar el código.')
      }
    }
  }

  async onToggleActive(code: DiscountCode): Promise<void> {
    if (!this.restaurantId) return
    try {
      await this.store.updateCode(this.restaurantId, code.id, {
        code: code.code,
        type: code.type,
        value: code.value,
        expiresAt: code.expiresAt,
        active: !code.active
      })
    } catch {
      alert('Error al actualizar el código.')
    }
  }

  formatValue(code: DiscountCode): string {
    return code.type === 'percent' ? `${code.value} %` : `${code.value.toFixed(2)} €`
  }

  isExpired(code: DiscountCode): boolean {
    return code.expiresAt !== null && new Date(code.expiresAt).getTime() <= Date.now()
  }
}
