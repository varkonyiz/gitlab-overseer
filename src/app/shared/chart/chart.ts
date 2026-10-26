import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { getComputedCSSProperty, registerTheme } from '@siemens/ix-echarts';

import { PreferencesService } from '../../core/preferences.service';

echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);
registerTheme(echarts);

/**
 * ECharts canvas with the iX theme for the current colour scheme. Charts are decoration over data
 * the page also shows as a table, so a chart that cannot render (no canvas) just stays empty.
 */
@Component({
  selector: 'app-chart',
  template: `<div #host class="chart" role="img" [attr.aria-label]="label()"></div>`,
  styles: `
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }
    .chart {
      width: 100%;
      height: var(--chart-height, 20rem);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Chart {
  readonly option = input.required<echarts.EChartsCoreOption>();
  readonly label = input.required<string>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly preferences = inject(PreferencesService);
  private instance: echarts.ECharts | null = null;
  private theme: string | null = null;

  constructor() {
    let observer: ResizeObserver | null = null;
    afterNextRender(() => {
      observer = new ResizeObserver(() => this.instance?.resize());
      observer.observe(this.host().nativeElement);
    });
    // After rendering: the canvas host exists and its size is known.
    afterRenderEffect(() => {
      const theme = `theme-classic-${this.preferences.colorScheme()}`;
      const option = this.option();
      if (this.theme !== theme) {
        this.instance?.dispose();
        this.instance = null;
        this.theme = theme;
      }
      if (!CANVAS_SUPPORTED) {
        return;
      }
      try {
        this.instance ??= echarts.init(this.host().nativeElement, theme);
        const host = this.host().nativeElement;
        this.instance.setOption(withColors(option, surfaceOf(host), textColor()), {
          notMerge: true,
        });
      } catch {
        this.instance = null; // e.g. no canvas support (unit tests)
      }
    });
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      this.instance?.dispose();
    });
  }
}

/** jsdom (unit tests) has no 2D canvas; ECharts would fail asynchronously there. */
const CANVAS_SUPPORTED = (() => {
  try {
    return document.createElement('canvas').getContext('2d') !== null;
  } catch {
    return false;
  }
})();

/** Placeholder for the colour behind the chart (the 2px gap between stacked segments). */
export const SURFACE = '__surface__';
/** Placeholder for the page's text colour (values next to marks wear text ink, not series colour). */
export const TEXT = '__text__';

function withColors(
  option: echarts.EChartsCoreOption,
  surface: string,
  text: string,
): echarts.EChartsCoreOption {
  // Series are plain data (formatters live in tooltip/axes), so a JSON copy of them is safe.
  const series = (option['series'] as unknown[] | undefined)?.map((s) => {
    const json = JSON.stringify(s);
    return json.includes(SURFACE) || json.includes(TEXT)
      ? JSON.parse(json.split(SURFACE).join(surface).split(TEXT).join(text))
      : s;
  });
  return series ? { ...option, series } : option;
}

/** The iX standard text colour of the current theme. */
function textColor(): string {
  return getComputedCSSProperty('color-std-text').trim() || 'currentColor';
}

/** The first non-transparent background behind the element (the iX card it sits on). */
function surfaceOf(element: HTMLElement): string {
  for (let el: HTMLElement | null = element; el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor;
    if (color && color !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(color)) {
      return color;
    }
  }
  return 'transparent';
}
