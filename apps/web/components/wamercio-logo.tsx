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

function Mark({light=false,className=''}:{light?:boolean;className?:string}){
  const outline=light?'#ffffff':'#0b2533'
  return <svg viewBox="0 0 108 108" aria-hidden="true" className={className}>
    <path d="M25 18h26M25 18c-7 0-13 6-13 13v46c0 7 6 13 13 13h9M83 18h0c7 0 13 6 13 13v46c0 7-6 13-13 13H72" fill="none" stroke={outline} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" opacity=".98"/>
    <path d="M34 33h16l10 27 12-27h16L80 76H63L53 54 43 76H26z" fill="#00c95f"/>
    <circle cx="42" cy="84" r="7" fill="#00c95f"/>
    <circle cx="66" cy="84" r="7" fill="#00c95f"/>
    <path d="M35.5 72.5H73" fill="none" stroke="#00c95f" strokeWidth="4.5" strokeLinecap="round" opacity=".7"/>
    <path d="M84 24h0" fill="none" stroke={outline} strokeWidth="7" strokeLinecap="round"/>
  </svg>
}

export default function WamercioLogo({mode='full',light=false,subtitle='Comercio conversacional',className=''}:Props){
  const textColor=light?'text-white':'text-[#0a3f2a]'
  const subColor=light?'text-white/65':'text-[#6e6759]'
  if(mode==='icon')return <span className={cx('inline-flex items-center',className)}><Mark light={light} className="h-10 w-10"/></span>
  return <span className={cx('inline-flex items-center',mode==='compact'?'gap-2.5':'gap-3',className)}>
    <Mark light={light} className={mode==='compact'?'h-10 w-10':'h-11 w-11'} />
    <span className="leading-none">
      <span className={cx('block font-extrabold tracking-[-.035em]',mode==='compact'?'text-[17px]':'text-[18px]',textColor)}>WAMERCIO</span>
      {subtitle!==false&&<span className={cx('mt-1 block text-[8px] font-bold uppercase tracking-[.18em]',subColor)}>{subtitle}</span>}
    </span>
  </span>
}
