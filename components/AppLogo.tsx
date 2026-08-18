import Image from "next/image";

type AppLogoProps = {
  size?: number;
  className?: string;
  alt?: string;
  priority?: boolean;
};

function logoAssetFor(size: number) {
  if (size <= 64) return "/logos/logo_64x64.png";
  if (size <= 128) return "/logos/logo_128x128.png";
  if (size <= 256) return "/logos/logo_256x256.png";
  return "/logos/logo_512x512.png";
}

export default function AppLogo({
  size = 64,
  className = "",
  alt = "لوگوی Dota2 Notes",
  priority = false,
}: AppLogoProps) {
  return (
    <Image
      className={`app-logo ${className}`.trim()}
      src={logoAssetFor(size)}
      width={size}
      height={size}
      sizes={`${size}px`}
      alt={alt}
      priority={priority}
    />
  );
}
