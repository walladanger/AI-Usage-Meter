import colors from 'tailwindcss/colors';
import { buildAccentTokens, getColorFamilies } from './colorProfiles';

const palette = colors as unknown as Record<string, Record<string, string>>;

test('maps the selected Tailwind family and shade to semantic accent tokens', () => {
  const tokens = buildAccentTokens({ family: 'sky', shade: 400 });
  const sky400 = palette.sky[400];

  expect(tokens.accent).toBe(sky400);
  expect(tokens.accentSoft).toContain(sky400.replace(/\)$/, '').trim());
  expect(tokens.focusRing).toBe(tokens.accent);
});

test('does not expose excluded Tailwind utility colors as accent families', () => {
  expect(getColorFamilies()).not.toEqual(
    expect.arrayContaining(['inherit', 'current', 'transparent']),
  );
});
