import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  IxApplication,
  IxApplicationHeader,
  IxContent,
  IxIconButton,
  IxMenu,
  IxMenuAvatar,
  IxMenuAvatarItem,
  IxMenuItem,
  IxMessageBar,
} from '@siemens/ix-angular/standalone';
import { addIcons } from '@siemens/ix-icons';
import {
  iconBarchart,
  iconCalendar,
  iconCheck,
  iconCogwheel,
  iconConnections,
  iconDownload,
  iconExport,
  iconGlobe,
  iconList,
  iconLogIn,
  iconLogOut,
  iconMoon,
  iconPlus,
  iconProject,
  iconRefresh,
  iconReset,
  iconSearch,
  iconStop,
  iconSun,
  iconTrashcan,
  iconTrophy,
  iconUpload,
  iconUserCheck,
} from '@siemens/ix-icons/icons';

import { AuthService } from '../core/auth/auth.service';
import { ConfigService } from '../core/config/config.service';
import { PreferencesService } from '../core/preferences.service';

addIcons({
  iconBarchart,
  iconCalendar,
  iconCheck,
  iconCogwheel,
  iconConnections,
  iconDownload,
  iconExport,
  iconGlobe,
  iconList,
  iconLogIn,
  iconLogOut,
  iconMoon,
  iconPlus,
  iconProject,
  iconRefresh,
  iconReset,
  iconSearch,
  iconStop,
  iconSun,
  iconTrashcan,
  iconTrophy,
  iconUpload,
  iconUserCheck,
});

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    IxApplication,
    IxApplicationHeader,
    IxContent,
    IxIconButton,
    IxMenu,
    IxMenuAvatar,
    IxMenuAvatarItem,
    IxMenuItem,
    IxMessageBar,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly configService = inject(ConfigService);
  protected readonly preferences = inject(PreferencesService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    // After the OAuth callback, open the page the user started the sign-in from.
    const returnTo = this.auth.returnTo();
    if (returnTo) {
      this.auth.returnTo.set(null);
      void this.router.navigateByUrl(returnTo);
    }

    // A session that ends (expired, revoked, refresh failed) sends the user to the sign-in page.
    let wasAuthenticated = this.auth.isAuthenticated();
    effect(() => {
      const authenticated = this.auth.isAuthenticated();
      if (wasAuthenticated && !authenticated) {
        void this.router.navigate(['/login']);
      }
      wasAuthenticated = authenticated;
    });
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
