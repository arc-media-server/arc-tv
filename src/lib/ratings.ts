// Star rating: 1–10 stores half stars out of five; zero clears it.
export const ratingChoices = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
export function stars(rating: number) {
  const r = Math.max(0, Math.min(10, Math.floor(rating)));
  return '★'.repeat(Math.floor(r / 2)) + (r % 2 ? '½' : '');
}
