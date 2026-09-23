type LogoMode='full'|'compact'|'icon'

type Props={
  mode?:LogoMode
  light?:boolean
  subtitle?:string|false
  className?:string
}

function cx(...parts:(string|false|undefined)[]){
  return parts.filter(Boolean).join(' ')
}

export default function WamercioLogo({mode='full',light=false,subtitle='Comercio conversacional',className=''}:Props){
  if(mode==='icon'){
    return <span className={cx('inline-flex items-center',className)}>
      <img src="/brand/wamercio-logo-icon.webp" alt="WAMERCIO" className="h-10 w-10 rounded-xl object-contain"/>
    </span>
  }

  if(mode==='full'){
    return <span className={cx('inline-flex items-center',className)}>
      <img src="/brand/wamercio-logo-full.webp" alt="WAMERCIO" className="h-10 w-auto object-contain sm:h-11"/>
    </span>
  }

  const titleColor=light?'text-white':'text-[#0a3f2a]'
  const subtitleColor=light?'text-white/65':'text-[#6e6759]'

  return <span className={cx('inline-flex items-center gap-3',className)}>
    <img src="/brand/wamercio-logo-icon.webp" alt="WAMERCIO" className="h-10 w-10 rounded-xl object-contain"/>
    <span className="leading-none">
      <span className={cx('block text-[17px] font-extrabold tracking-[-.035em]',titleColor)}>WAMERCIO</span>
      {subtitle!==false&&<span className={cx('mt-1 block text-[8px] font-bold uppercase tracking-[.18em]',subtitleColor)}>{subtitle}</span>}
    </span>
  </span>
}
