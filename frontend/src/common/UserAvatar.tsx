import React, { useMemo, useState } from 'react';
import * as FiIcons from 'react-icons/fi';

const { FiUser } = FiIcons;

export const userProfileImageUrl = (value: any): string => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  return String(
    value.profile_picture_url ||
    value.profilePictureUrl ||
    value.profile_picture ||
    value.profilePicture ||
    value.avatar_url ||
    value.avatarUrl ||
    value.photo_url ||
    value.photoUrl ||
    ''
  ).trim();
};

const buildInitials = (user: any, explicitName = '', explicitInitials = '') => {
  if (explicitInitials) return explicitInitials.slice(0, 2).toUpperCase();
  const fullName = String(
    explicitName ||
    user?.name ||
    user?.name ||
    `${user?.first_name || ''} ${user?.last_name || user?.last_name || ''}` ||
    user?.username ||
    ''
  ).trim();
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
  return initials || (user || explicitName ? 'U' : '');
};

type UserAvatarProps = {
  user?: any;
  name?: string;
  initials?: string;
  className?: string;
  imageClassName?: string;
  textClassName?: string;
  icon?: any;
  iconClassName?: string;
  title?: string;
};

const UserAvatar = ({
  user = null,
  name = '',
  initials = '',
  className = 'w-10 h-10 rounded-full bg-[#00a884]/10 text-[#00a884] flex items-center justify-center border border-[#00a884]/20',
  imageClassName = 'w-full h-full object-cover',
  textClassName = 'text-xs font-black',
  icon: Icon = FiUser,
  iconClassName = 'text-base',
  title = '',
}: UserAvatarProps) => {
  const [broken, setBroken] = useState(false);
  const src = userProfileImageUrl(user);
  const fallback = useMemo(() => buildInitials(user, name, initials), [user, name, initials]);

  return (
    <div className={`${className} overflow-hidden`} title={title || name || user?.name || user?.name || ''}>
      {src && !broken ? (
        <img src={src} alt={title || name || user?.name || user?.name || 'Avatar'} className={imageClassName} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : fallback ? (
        <span className={textClassName}>{fallback}</span>
      ) : (
        <Icon className={iconClassName} />
      )}
    </div>
  );
};

export default UserAvatar;
