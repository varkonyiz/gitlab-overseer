import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  IxButton,
  IxCard,
  IxCardContent,
  IxContentHeader,
  IxEmptyState,
  IxKpi,
} from '@siemens/ix-angular/standalone';

import { AuthService } from '../../core/auth/auth.service';
import { DataSourcesService } from '../../core/sources/data-sources.service';

/** Landing page. Metric widgets are added here once the metric definitions are settled. */
@Component({
  selector: 'app-dashboard-page',
  imports: [
    RouterLink,
    TranslatePipe,
    IxButton,
    IxCard,
    IxCardContent,
    IxContentHeader,
    IxEmptyState,
    IxKpi,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  protected readonly auth = inject(AuthService);
  protected readonly sources = inject(DataSourcesService);
}
