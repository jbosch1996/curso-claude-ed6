import { Component, inject, OnInit, signal } from '@angular/core'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { FormsModule } from '@angular/forms'
import { TableService } from '../../core/services/table.service'
import { CartStore } from '../../core/store/cart.store'
import { AvailableTable } from '../../core/models/table.model'

const MAX_GUESTS = 50

@Component({
  selector: 'app-table-selection',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="container">
      <div class="page-header">
        <a routerLink="/restaurants" class="back-link">← Volver a restaurantes</a>
        <h1>Elige tu mesa</h1>
        <p>Indica cuántas personas sois y selecciona una mesa libre</p>
      </div>

      <form class="card search-card" (ngSubmit)="search()">
        <div class="form-group">
          <label for="guests">Número de personas</label>
          <input id="guests" type="number" class="form-control" [(ngModel)]="guests" name="guests" min="1" [max]="maxGuests" step="1" required />
        </div>
        <button type="submit" class="btn btn-primary" [disabled]="searching()">Buscar mesas</button>
      </form>

      @if (error()) {
        <div class="alert-error">{{ error() }}</div>
      }

      @if (searching()) {
        <div class="spinner"></div>
      } @else if (searched()) {
        @if (tables().length === 0) {
          <div class="empty-state">
            <p>No hay mesas libres para {{ searchedGuests() }} personas en este momento</p>
          </div>
        } @else {
          <div class="tables-grid">
            @for (table of tables(); track table.id) {
              <button type="button" class="table-card card" [class.selected]="selectedId() === table.id" (click)="selectedId.set(table.id)">
                <span class="table-number">Mesa {{ table.number }}</span>
                <span class="table-capacity">Hasta {{ table.capacity }} personas</span>
                @if (table.description) {
                  <span class="table-description">{{ table.description }}</span>
                }
              </button>
            }
          </div>

          <button type="button" class="btn btn-primary continue-btn" [disabled]="!selectedId() || occupying()" (click)="continue()">
            {{ occupying() ? 'Reservando mesa...' : 'Continuar' }}
          </button>
        }
      }
    </div>
  `,
  styles: [`
    .container {
      max-width: 700px;
      margin: 0 auto;
    }
    .back-link {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 8px;
      display: inline-block;
    }
    .search-card {
      display: flex;
      align-items: flex-end;
      gap: 16px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .search-card .form-group {
      flex: 1;
      margin: 0;
    }
    .tables-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }
    .table-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 16px;
      text-align: left;
      cursor: pointer;
      border: 2px solid var(--border-color);
      background: var(--bg-card);
      color: inherit;
    }
    .table-card.selected {
      border-color: var(--green-light);
      background: var(--green-glow);
    }
    .table-number {
      font-weight: 600;
      color: var(--text-primary);
      font-size: 16px;
    }
    .table-capacity {
      font-size: 13px;
      color: var(--text-secondary);
    }
    .table-description {
      font-size: 12px;
      color: var(--text-muted);
    }
    .continue-btn {
      width: 100%;
      justify-content: center;
    }
  `]
})
export class TableSelectionComponent implements OnInit {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly tableService = inject(TableService)
  private readonly cartStore = inject(CartStore)

  readonly maxGuests = MAX_GUESTS
  guests = 2
  private restaurantId = ''

  readonly tables = signal<AvailableTable[]>([])
  readonly selectedId = signal<string | null>(null)
  readonly searching = signal(false)
  readonly occupying = signal(false)
  readonly searched = signal(false)
  readonly searchedGuests = signal(0)
  readonly error = signal<string | null>(null)

  ngOnInit(): void {
    this.restaurantId = this.route.snapshot.paramMap.get('id')!
  }

  search(): void {
    if (!Number.isInteger(this.guests) || this.guests < 1 || this.guests > MAX_GUESTS) {
      this.error.set(`Indica un número de personas entre 1 y ${MAX_GUESTS}.`)
      return
    }
    this.error.set(null)
    this.load()
  }

  continue(): void {
    const tableId = this.selectedId()
    if (!tableId || this.occupying()) return

    this.occupying.set(true)
    this.error.set(null)
    this.tableService.occupy(this.restaurantId, tableId, this.searchedGuests()).subscribe({
      next: (table) => {
        this.cartStore.setTable(this.restaurantId, table)
        this.router.navigate(['/restaurants', this.restaurantId])
      },
      error: () => {
        this.occupying.set(false)
        this.error.set('Esa mesa ya no está disponible. Elige otra.')
        this.load()
      }
    })
  }

  private load(): void {
    this.searching.set(true)
    this.selectedId.set(null)
    this.searchedGuests.set(this.guests)
    this.tableService.getAvailable(this.restaurantId, this.guests).subscribe({
      next: (tables) => {
        this.tables.set(tables)
        this.searched.set(true)
        this.searching.set(false)
      },
      error: () => {
        this.error.set('No se pudieron cargar las mesas. Inténtalo de nuevo.')
        this.searching.set(false)
      }
    })
  }
}
