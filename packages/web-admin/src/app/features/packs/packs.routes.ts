import type { Routes } from '@angular/router'

export const PACK_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/pack-list/pack-list.component').then(m => m.PackListComponent)
  },
  {
    path: 'new',
    loadComponent: () => import('./pages/pack-form/pack-form.component').then(m => m.PackFormComponent)
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./pages/pack-form/pack-form.component').then(m => m.PackFormComponent)
  }
]
