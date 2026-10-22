import { Routes } from '@angular/router'
import { authGuard, LoginComponent } from '@resttek/web-shared'

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('@resttek/web-shared').then(m => m.LoginComponent)
  },
  {
    path: '',
    loadComponent: () => import('./core/layout/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'restaurants',
        loadChildren: () => import('./features/restaurants/restaurants.routes').then(m => m.RESTAURANT_ROUTES)
      },
      {
        path: 'restaurants/:restaurantId',
        children: [
          { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
          {
            path: 'dashboard',
            loadComponent: () => import('./features/restaurants/pages/restaurant-dashboard/restaurant-dashboard.component').then(m => m.RestaurantDashboardComponent)
          },
          {
            path: 'dishes',
            loadChildren: () => import('./features/dishes/dishes.routes').then(m => m.DISH_ROUTES)
          },
          {
            path: 'ingredients',
            loadChildren: () => import('./features/ingredients/ingredients.routes').then(m => m.INGREDIENT_ROUTES)
          },
          {
            path: 'discount-codes',
            loadChildren: () => import('./features/discounts/discounts.routes').then(m => m.DISCOUNT_CODE_ROUTES)
          },
          {
            path: 'points-rules',
            loadComponent: () => import('./features/discounts/pages/points-rules/points-rules.component').then(m => m.PointsRulesComponent)
          },
          {
            path: 'employees',
            loadChildren: () => import('./features/employees/employees.routes').then(m => m.EMPLOYEE_ROUTES)
          }
        ]
      }
    ]
  },
  {
    path: '**',
    loadComponent: () => import('./core/layout/not-found.component').then(m => m.NotFoundComponent)
  }
]
