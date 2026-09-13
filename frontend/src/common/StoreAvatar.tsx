import React from 'react';

const pickLogo = (value: any) => String(value?.logoUrl || value?.logo_url || value?.logo || '').trim();
const pickEmoji = (value: any) => String(value?.emoji || '🏪').trim() || '🏪';
const pickColor = (value: any) => String(value?.color || '#00a884').trim() || '#00a884';

const StoreAvatar = ({
  store,
  logoUrl,
  emoji,
  color,
  name,
  className = 'w-10 h-10 rounded-2xl',
  imageClassName = 'w-full h-full object-cover',
  textClassName = 'text-xl',
}: any) => {
  const src = String(logoUrl || pickLogo(store)).trim();
  const fallback = String(emoji || pickEmoji(store)).trim() || '🏪';
  const accent = String(color || pickColor(store)).trim() || '#00a884';
  const label = String(name || store?.name || 'Logo del negocio').trim();

  return (
    <div
      className={`${className} flex items-center justify-center overflow-hidden shrink-0 border border-black/5 bg-white`}
      style={{ backgroundColor: `${accent}18` }}
      title={label}
    >
      {src ? (
        <img
          src={src}
          alt={label}
          className={imageClassName}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className={textClassName}>{fallback}</span>
      )}
    </div>
  );
};

export default StoreAvatar;
