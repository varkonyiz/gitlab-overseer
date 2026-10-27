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
    path: 'merge-requests',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/merge-requests/merge-requests.page').then((m) => m.MergeRequestsPage),
  },
  {
    path: 'sprints',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/sprints/sprints.page').then((m) => m.SprintsPage),
  },
  {
    path: 'reviewers',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/reviewers/reviewers.page').then((m) => m.ReviewersPage),
  },
  {
    path: 'assign',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/assign/assign.page').then((m) => m.AssignPage),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
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
