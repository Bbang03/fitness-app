/* Hallmark · component: icon family · design-system: design.md
 * pre-emit critique: P4 H4 E4 S4 R5 V4
 * Original 24-unit paths. Squared ends, bevel joins, inherited semantic colour.
 */
import { forwardRef, type SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };
function icon(name: string, d: string) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
    { size = 24, children, className = '', ...props }, ref,
  ) {
    const labelled = Boolean(props['aria-label'] || props['aria-labelledby']);
    return <svg ref={ref} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="square" strokeLinejoin="bevel"
      aria-hidden={labelled ? undefined : true} role={labelled ? 'img' : undefined} focusable="false"
      className={`chagok-icon ${className}`} data-icon={name} {...props}>
      <path d={d} />{children}
    </svg>;
  });
  Icon.displayName = name;
  return Icon;
}

export const Dumbbell = icon('Dumbbell', 'M2 9v6M5 6h4v12H5zM9 12h6M15 6h4v12h-4zM22 9v6');
export const Loader2 = icon('Loader2', 'M12 3h4l5 5v8l-5 5H8l-5-5v-4');
