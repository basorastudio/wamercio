import React from 'react';

type MotorcycleIconProps = React.SVGProps<SVGSVGElement> & {
  title?: string;
  size?: string | number;
};

export default function MotorcycleIcon({ title, size = '1em', className = '', width = size, height = size, ...props }: MotorcycleIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={width}
      height={height}
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="5" cy="17" r="3" />
      <circle cx="19" cy="17" r="3" />
      <path d="M8 17h3.2l2.4-5.2h2.6l2.8 5.2" />
      <path d="m11.2 17-3-6H5.8" />
      <path d="M13.6 11.8 12 8.8h-2.1" />
      <path d="M16.2 11.8 18 9.5h2" />
      <path d="M14.7 8.8h2.6" />
      <path d="M10.6 12.2h4.8" />
    </svg>
  );
}
