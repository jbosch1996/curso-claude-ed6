import { Component, DestroyRef, inject, OnInit } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { DecimalPipe } from '@angular/common'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { LucideAngularModule } from 'lucide-angular'
import { PackStore } from '../../store/pack.store'
import type { DishCategory } from '../../../dishes/models/dish.model'

const CATEGORY_LABELS: Record<DishCategory, string> = {
  entrante: 'Entrante', principal: 'Principal', postre: 'Postre', bebida: 'Bebida'
}

@Component({
  selector: 'app-pack-list',
  standalone: true,
  imports: [RouterLink, LucideAngularModule, DecimalPipe],
  templateUrl: './pack-list.component.html',
  styleUrl: './pack-list.component.css'
})
export class PackListComponent implements OnInit {
  readonly store = inject(PackStore)
  private readonly route = inject(ActivatedRoute)
  private readonly destroyRef = inject(DestroyRef)
  restaurantId = ''

  ngOnInit(): void {
    this.route.parent?.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.restaurantId = params.get('restaurantId') ?? ''
        if (this.restaurantId) {
          this.store.loadByRestaurant(this.restaurantId)
        }
      })
  }

  async onDelete(id: string): Promise<void> {
    if (!this.restaurantId) return
    if (confirm('¿Estás seguro de eliminar este pack?')) {
      try {
        await this.store.delete(this.restaurantId, id)
      } catch {
        alert('Error al eliminar el pack.')
      }
    }
  }

  getCategoriesLabel(categories: DishCategory[]): string {
    return categories.map(c => CATEGORY_LABELS[c] ?? c).join(' + ')
  }
}
