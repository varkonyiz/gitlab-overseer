import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
    title: 'GitLab Overseer',
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'sources',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/data-sources/data-sources.page').then((m) => m.DataSourcesPage),
  },
  {
    path: 'connection',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/connection/connection.page').then((m) => m.ConnectionPage),
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
