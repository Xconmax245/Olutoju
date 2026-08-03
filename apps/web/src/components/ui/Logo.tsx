import Image from "next/image";

interface LogoProps {
  /** When true, the square renders in --paper for use on dark surfaces (kept for compatibility). */
  onDark?: boolean;
  size?: number;
}

/**
 * Olutoju brand mark using the provided PNG logo.
 */
export function Logo({ size = 32 }: LogoProps) {
  // Original is 677x369. Aspect ratio ~1.83
  const width = Math.round(size * (677 / 369));
  return (
    <Image 
      src="/logo.png" 
      alt="Olutoju Logo" 
      width={width} 
      height={size} 
      style={{ objectFit: "contain", display: "block" }}
    />
  );
}