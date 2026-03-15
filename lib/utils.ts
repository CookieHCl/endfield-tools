export function imgPath(s: string): string {
  return (process.env.NODE_ENV === 'production') ? `/endfield-tools${s}` : s;
}