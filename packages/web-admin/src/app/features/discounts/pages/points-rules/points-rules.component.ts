import { Component, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute } from '@angular/router'
import { LucideAngularModule } from 'lucide-angular'
import { DiscountStore } from '../../store/discount.store'
import type { CreatePointsRuleDto, PointsRule } from '../../models/discount.model'

@Component({
  selector: 'app-points-rules',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './points-rules.component.html',
  styleUrl: './points-rules.component.css'
})
export class PointsRulesComponent implements OnInit {
  readonly store = inject(DiscountStore)
  private readonly route = inject(ActivatedRoute)

  restaurantId = ''
  editingId = signal<string | null>(null)
  saving = signal(false)
  formError = signal<string | null>(null)

  form: CreatePointsRuleDto = { points: 10, discount: 1 }

  ngOnInit(): void {
    this.restaurantId = this.route.parent?.snapshot.params['restaurantId'] ?? ''
    if (this.restaurantId) {
      this.store.loadRules(this.restaurantId)
    }
  }

  onEdit(rule: PointsRule): void {
    this.editingId.set(rule.id)
    this.form = { points: rule.points, discount: rule.discount }
    this.formError.set(null)
  }

  onCancel(): void {
    this.editingId.set(null)
    this.form = { points: 10, discount: 1 }
    this.formError.set(null)
  }

  async onSubmit(): Promise<void> {
    if (!this.restaurantId) return
    this.formError.set(null)
    this.saving.set(true)
    try {
      const id = this.editingId()
      if (id) {
        await this.store.updateRule(this.restaurantId, id, this.form)
      } else {
        await this.store.createRule(this.restaurantId, this.form)
      }
      this.onCancel()
    } catch (err: any) {
      this.formError.set(err?.error?.message ?? 'Error al guardar la equivalencia.')
    } finally {
      this.saving.set(false)
    }
  }

  async onDelete(id: string): Promise<void> {
    if (!this.restaurantId) return
    if (confirm('¿Estás seguro de eliminar esta equivalencia?')) {
      try {
        await this.store.deleteRule(this.restaurantId, id)
        if (this.editingId() === id) this.onCancel()
      } catch {
        alert('Error al eliminar la equivalencia.')
      }
    }
  }

  formatDiscount(discount: number): string {
    return discount.toFixed(2) + ' €'
  }
}
