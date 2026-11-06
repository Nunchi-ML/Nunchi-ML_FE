import { useId } from 'react';

/** Small local illustrations: road identity, not a preview of current conditions. */
export function RoadScene({ tunnel = false }: { tunnel?: boolean }) {
  const id = useId();
  return <svg className="road-scene" viewBox="0 0 240 80" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-sky`} x2="0" y2="80" gradientUnits="userSpaceOnUse">
        <stop stopColor={tunnel ? '#5a554b' : '#8c4628'} /><stop offset="1" stopColor={tunnel ? '#c5b48a' : '#ffbc60'} />
      </linearGradient>
      <radialGradient id={`${id}-light`}><stop stopColor="#ffe6a1" stopOpacity=".7" /><stop offset="1" stopColor="#ffe6a1" stopOpacity="0" /></radialGradient>
    </defs>
    <path fill={`url(#${id}-sky)`} d="M0 0h240v80H0z" />
    {tunnel ? <>
      <path fill="#292924" d="M0 0h240v80h-37l-41-49H78L37 80H0z" />
      <path fill="#171b1a" d="M25 80 66 15h108l41 65h-12l-41-49H78L37 80z" />
      <path stroke="#aea386" strokeOpacity=".45" d="M0 20 58 5h124l58 15M0 53l68-29m172 29-68-29" />
      <path stroke="#f5d69a" strokeWidth="3" d="m65 24-9 15m119-15 9 15" />
      <ellipse cx="120" cy="35" rx="55" ry="36" fill={`url(#${id}-light)`} />
    </> : <>
      <circle cx="155" cy="27" r="42" fill={`url(#${id}-light)`} />
      <circle cx="155" cy="27" r="13" fill="#ffdf8a" />
      <path fill="#654436" d="M0 24h17v23h9V15h19v32h12V29h17v18h19V36h13v11h70V30h15v17h11V19h21v28h17v33H0z" />
      <path fill="#493b30" d="M0 44h240v36H0z" />
      <path stroke="#b99767" strokeWidth="2" d="M24 80 95 44m121 36-71-36" />
    </>}
    <path fill="#252a28" d="M40 80 99 42h42l59 38z" />
    <path stroke="#e5cc8e" strokeWidth="1.4" d="m72 80 37-38m59 38-37-38" />
    <path stroke="#fff0c5" strokeWidth="2" d="M120 45v4m0 4v7m0 7v13" />
  </svg>;
}
