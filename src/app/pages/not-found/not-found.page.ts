import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { IxButton, IxContentHeader } from '@siemens/ix-angular/standalone';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, TranslatePipe, IxButton, IxContentHeader],
  template: `
    <ix-content-header [headerTitle]="'notFound.title' | translate"></ix-content-header>
    <p>{{ 'notFound.text' | translate }}</p>
    <ix-button routerLink="/">{{ 'notFound.home' | translate }}</ix-button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
