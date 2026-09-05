import { withAlpha } from './colorProfiles';

test('appends hex alpha to hex color', () => {
  expect(withAlpha('#112233', '80')).toBe('#11223380');
});

test('accepts alpha with leading #', () => {
  expect(withAlpha('#112233', '#80')).toBe('#11223380');
});

test('oklch: appends alpha when none present', () => {
  const color = 'oklch(61.2% 0.05 240)';
  // 0x80 -> ~0.502
  expect(withAlpha(color, '80')).toBe('oklch(61.2% 0.05 240 / 0.502)');
});

test('oklch: replaces existing alpha', () => {
  const color = 'oklch(61.2% 0.05 240 / 0.250)';
  expect(withAlpha(color, '80')).toBe('oklch(61.2% 0.05 240 / 0.502)');
});

test('invalid alpha returns original color', () => {
  const color = '#112233';
  expect(withAlpha(color, 'zz')).toBe('#112233');
});

// Additional edge cases

test('single digit hex alpha is normalized to two digits', () => {
  expect(withAlpha('#112233', 'f')).toBe('#1122330f');
  expect(withAlpha('#112233', 'F')).toBe('#1122330f');
});

test('00 becomes 00 and ff becomes ff', () => {
  expect(withAlpha('#112233', '00')).toBe('#11223300');
  expect(withAlpha('#112233', 'ff')).toBe('#112233ff');
});
