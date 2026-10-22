import { Component, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { LucideAngularModule } from 'lucide-angular'
import { firstValueFrom } from 'rxjs'
import { DiscountStore } from '../../store/discount.store'
import { DiscountService } from '../../services/discount.service'
import type { CreateDiscountCodeDto } from '../../models/discount.model'

@Component({
  selector: 'app-discount-code-form',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './discount-code-form.component.html',
  styleUrl: './discount-code-form.component.css'
})
export class DiscountCodeFormComponent implements OnInit {
  private readonly store = inject(DiscountStore)
  private readonly service = inject(DiscountService)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)

  isEditing = false
  codeId: string | null = null
  restaurantId = ''
  loading = signal(false)
  error = signal<string | null>(null)

  form: CreateDiscountCodeDto = {
    code: '',
    type: 'percent',
    value: 10,
    expiresAt: null,
    active: true
  }

  // <input type="date"> trabaja con "AAAA-MM-DD"; la API recibe/devuelve ISO.
  expiresDate = ''

  get pageTitle(): string {
    return this.isEditing ? 'Editar código de descuento' : 'Nuevo código de descuento'
  }

  get listUrl(): string {
    return `/restaurants/${this.restaurantId}/discount-codes`
  }

  ngOnInit(): void {
    this.restaurantId = this.route.parent?.snapshot.params['restaurantId'] ?? ''
    const id = this.route.snapshot.paramMap.get('id')

    if (id && this.restaurantId) {
      this.isEditing = true
      this.codeId = id
      this.loadCode()
    }
  }

  private async loadCode(): Promise<void> {
    this.loading.set(true)
    try {
      const code = await firstValueFrom(this.service.getCodeById(this.restaurantId, this.codeId!))
      this.form = { code: code.code, type: code.type, value: code.value, expiresAt: code.expiresAt, active: code.active }
      this.expiresDate = code.expiresAt ? code.expiresAt.slice(0, 10) : ''
    } catch {
      this.error.set('No se pudo cargar el código.')
    } finally {
      this.loading.set(false)
    }
  }

  async onSubmit(): Promise<void> {
    this.error.set(null)
    this.loading.set(true)
    const dto: CreateDiscountCodeDto = { ...this.form, expiresAt: this.expiresDate || null }
    try {
      if (this.isEditing && this.codeId) {
        await this.store.updateCode(this.restaurantId, this.codeId, dto)
      } else {
        await this.store.createCode(this.restaurantId, dto)
      }
      this.router.navigate(['/restaurants', this.restaurantId, 'discount-codes'])
    } catch (err: any) {
      this.error.set(err?.error?.message ?? 'Error al guardar el código.')
    } finally {
      this.loading.set(false)
    }
  }
}
