import { ColorScheme } from '../../core/preferences.service';

/**
 * Categorical series colours, in fixed order (colour follows the entity, never its rank). Taken from
 * the iX chart tokens (chart-1, -10, -15, -8, -17, -12) and re-ordered so neighbours stay apart for
 * colour-blind readers; dark mode uses darker steps of the same hues to sit inside the dark
 * lightness band. Both sets pass the dataviz palette validator (lightness, chroma, CVD ΔE ≥ 8,
 * normal-vision ΔE ≥ 15, ≥ 3:1 contrast). More than six series fold into "Other".
 */
export const SERIES_COLORS: Readonly<Record<ColorScheme, readonly string[]>> = {
  light: ['#008A7C', '#7C40FF', '#B74E2A', '#0041D6', '#7A8000', '#AA32BE'],
  dark: ['#009E90', '#8F6EF0', '#CC7646', '#5F82E0', '#8C9200', '#BB57D1'],
};

/** Neutral for the folded "Other" series (iX chart-5). */
export const OTHER_COLOR: Readonly<Record<ColorScheme, string>> = {
  light: '#61778C',
  dark: '#90B4C5',
};

export const MAX_SERIES = SERIES_COLORS.light.length;
