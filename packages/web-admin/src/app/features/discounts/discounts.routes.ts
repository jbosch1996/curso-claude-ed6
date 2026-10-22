import type { Routes } from '@angular/router'

export const DISCOUNT_CODE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/discount-code-list/discount-code-list.component').then(m => m.DiscountCodeListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./pages/discount-code-form/discount-code-form.component').then(m => m.DiscountCodeFormComponent)
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./pages/discount-code-form/discount-code-form.component').then(m => m.DiscountCodeFormComponent)
  }
]
