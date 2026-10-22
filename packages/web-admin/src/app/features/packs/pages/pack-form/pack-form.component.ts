import { Component, computed, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { DecimalPipe } from '@angular/common'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { LucideAngularModule } from 'lucide-angular'
import { firstValueFrom } from 'rxjs'
import { PackStore } from '../../store/pack.store'
import { PackService } from '../../services/pack.service'
import { DishService } from '../../../dishes/services/dish.service'
import type { Dish, DishCategory } from '../../../dishes/models/dish.model'

@Component({
  selector: 'app-pack-form',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule, DecimalPipe],
  templateUrl: './pack-form.component.html',
  styleUrl: './pack-form.component.css'
})
export class PackFormComponent implements OnInit {
  private readonly store = inject(PackStore)
  private readonly service = inject(PackService)
  private readonly dishService = inject(DishService)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)

  isEditing = false
  packId: string | null = null
  restaurantId = ''
  loading = signal(false)
  error = signal<string | null>(null)

  readonly allCategories: { value: DishCategory; label: string }[] = [
    { value: 'entrante', label: 'Entrante' },
    { value: 'principal', label: 'Principal' },
    { value: 'postre', label: 'Postre' },
    { value: 'bebida', label: 'Bebida' }
  ]

  form = { name: '', description: null as string | null, price: 10, available: true }
  readonly categories = signal<DishCategory[]>([])
  readonly excludedDishIds = signal<string[]>([])
  readonly dishes = signal<Dish[]>([])

  /** Categorías marcadas, en el orden fijo de la carta, con los platos del restaurante de cada una. */
  readonly selectedCategories = computed(() =>
    this.allCategories
      .filter(c => this.categories().includes(c.value))
      .map(c => ({ ...c, dishes: this.dishes().filter(d => d.category === c.value) }))
  )

  get pageTitle(): string {
    return this.isEditing ? 'Editar pack' : 'Nuevo pack'
  }

  get listUrl(): string {
    return `/restaurants/${this.restaurantId}/packs`
  }

  ngOnInit(): void {
    this.restaurantId = this.route.parent?.snapshot.params['restaurantId'] ?? ''
    const id = this.route.snapshot.paramMap.get('id')
    if (!this.restaurantId) return

    this.loadDishes()
    if (id) {
      this.isEditing = true
      this.packId = id
      this.loadPack()
    }
  }

  private async loadDishes(): Promise<void> {
    try {
      this.dishes.set(await firstValueFrom(this.dishService.getAll(this.restaurantId)))
    } catch {
      this.error.set('No se pudieron cargar los platos del restaurante.')
    }
  }

  private async loadPack(): Promise<void> {
    this.loading.set(true)
    try {
      const pack = await firstValueFrom(this.service.getById(this.restaurantId, this.packId!))
      this.form = { name: pack.name, description: pack.description, price: pack.price, available: pack.available }
      this.categories.set(pack.categories)
      this.excludedDishIds.set(pack.excludedDishIds)
    } catch {
      this.error.set('No se pudo cargar el pack.')
    } finally {
      this.loading.set(false)
    }
  }

  isCategorySelected(category: DishCategory): boolean {
    return this.categories().includes(category)
  }

  toggleCategory(category: DishCategory): void {
    this.categories.update(list => list.includes(category) ? list.filter(c => c !== category) : [...list, category])
  }

  isEligible(dishId: string): boolean {
    return !this.excludedDishIds().includes(dishId)
  }

  toggleEligible(dishId: string): void {
    this.excludedDishIds.update(list => list.includes(dishId) ? list.filter(id => id !== dishId) : [...list, dishId])
  }

  async onSubmit(): Promise<void> {
    this.error.set(null)
    if (this.categories().length === 0) {
      this.error.set('Elige al menos una categoría.')
      return
    }

    // Solo se envían como excluidos los platos de las categorías que forman el pack.
    const categories = this.allCategories.map(c => c.value).filter(c => this.categories().includes(c))
    const excludedDishIds = this.excludedDishIds()
      .filter(id => this.dishes().some(d => d.id === id && categories.includes(d.category)))
    const dto = { ...this.form, categories, excludedDishIds }

    this.loading.set(true)
    try {
      if (this.isEditing && this.packId) {
        await this.store.update(this.restaurantId, this.packId, dto)
      } else {
        await this.store.create(this.restaurantId, dto)
      }
      this.router.navigate(['/restaurants', this.restaurantId, 'packs'])
    } catch (err: any) {
      this.error.set(err?.error?.message ?? 'Error al guardar el pack.')
    } finally {
      this.loading.set(false)
    }
  }
}
