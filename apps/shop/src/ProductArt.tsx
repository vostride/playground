import { useId } from 'react';
export function ProductArt({
  art,
  color = 'Sand',
  className = '',
}: {
  art: string;
  color?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const palette: Record<string, string> = {
    Sand: '#d1b995',
    Sage: '#93a18a',
    Moss: '#4c604c',
    Amber: '#a56230',
    Natural: '#d8c9af',
    Oak: '#b58a5d',
    Clear: '#c3ceca',
    Terracotta: '#ac6953',
    Chalk: '#ddd6c7',
    Forest: '#344f43',
    Brass: '#b29a6c',
    Clay: '#b38169',
  };
  const c = palette[color] || '#bfa685';
  return (
    <svg className={className} viewBox="0 0 320 270" role="img" aria-label={`${color} ${art}`}>
      <defs>
        <linearGradient id={`${id}shade`} x1="0" x2="1">
          <stop stopColor={c} />
          <stop offset=".45" stopColor={c} />
          <stop offset="1" stopColor="#000" stopOpacity=".23" />
        </linearGradient>
        <filter id={`${id}shadow`} x="-50%" y="-100%" width="200%" height="300%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <ellipse
        cx="164"
        cy="227"
        rx={art === 'throw' ? 91 : 67}
        ry="8"
        fill="#4e443b"
        opacity=".15"
        filter={`url(#${id}shadow)`}
      />
      <g fill={`url(#${id}shade)`}>
        {art === 'lamp' && (
          <>
            <ellipse cx="160" cy="218" rx="49" ry="8" fill="#99764f" />
            <path d="M149 123h22v91q-11 8-22 0z" fill="#b3936d" />
            <path d="M117 61q43-19 86 0l37 77q-80 25-160 0z" />
            <ellipse cx="160" cy="138" rx="80" ry="14" fill="#e5d8c3" />
            <path d="M148 143h24v8h-24" fill="#856b4e" />
          </>
        )}
        {art === 'mug' && (
          <>
            <path d="M211 105c67-19 66 82 7 75" fill="none" stroke={c} strokeWidth="17" />
            <path d="M98 99h121l-8 105q-52 32-105 0z" />
            <ellipse cx="158" cy="99" rx="61" ry="15" fill="#b8c1ae" />
            <ellipse cx="158" cy="100" rx="51" ry="10" fill="#62725b" />
            <path d="M113 120l4 70" stroke="#fff" strokeOpacity=".2" strokeWidth="4" fill="none" />
          </>
        )}
        {art === 'notebook' && (
          <g transform="rotate(-11 160 140)">
            <rect x="103" y="57" width="120" height="165" rx="4" fill="#e5ddc7" />
            <path d="M98 50h119v165H98q-10 0-10-10V61q0-11 10-11" />
            <path d="M102 52v160" stroke="#1e322a" opacity=".6" />
            <path d="M197 51v165" stroke="#1c2d22" strokeWidth="4" opacity=".5" />
            <text
              x="157"
              y="120"
              textAnchor="middle"
              fill="#c6cbb6"
              fontSize="10"
              letterSpacing="3"
            >
              NOTES
            </text>
          </g>
        )}
        {art === 'vase' && (
          <>
            <g fill="none" stroke="#6c7c52" strokeWidth="3">
              <path d="M157 130q6-72-23-105M162 128q4-68 42-86M161 100q-31-47-58-40" />
            </g>
            <g fill="#7d8b64">
              <ellipse cx="131" cy="40" rx="8" ry="18" transform="rotate(-35 131 40)" />
              <ellipse cx="185" cy="61" rx="8" ry="19" transform="rotate(40 185 61)" />
              <ellipse cx="111" cy="63" rx="8" ry="16" transform="rotate(-54 111 63)" />
              <ellipse cx="203" cy="44" rx="7" ry="16" transform="rotate(48 203 44)" />
            </g>
            <path d="M137 110h45v37q33 18 33 49q0 29-55 29t-55-29q0-31 32-49z" opacity=".88" />
            <path
              d="M128 170q-15 32 3 40"
              fill="none"
              stroke="#efc399"
              opacity=".5"
              strokeWidth="5"
            />
            <ellipse cx="160" cy="110" rx="23" ry="5" fill="#704628" />
          </>
        )}
        {art === 'tote' && (
          <>
            <path
              d="M119 104V81q0-56 40-56t40 56v25"
              fill="none"
              stroke="#b9ab91"
              strokeWidth="13"
            />
            <path d="M86 98h147l14 119q-83 21-174 0z" />
            <path d="M98 109l-11 96M219 111l13 94" fill="none" stroke="#ae9f84" />
            <text
              x="160"
              y="164"
              fill="#526047"
              textAnchor="middle"
              fontFamily="Georgia"
              fontSize="18"
            >
              Komazon
            </text>
            <text x="160" y="181" fill="#6b755e" textAnchor="middle" fontSize="5" letterSpacing="2">
              GOOD THINGS, EVERY DAY.
            </text>
          </>
        )}
        {art === 'tray' && (
          <g transform="translate(20 35) rotate(-12 140 140)">
            <path d="M39 126l139-57 92 62-134 75z" />
            <path d="M39 126v18l97 76 134-70v-19l-134 75z" fill="#967047" />
            <path d="M58 127l118-46 75 50-116 59z" fill="#cba679" />
            <path
              d="M103 109l61-23M81 132l101-39M111 145l97-39"
              stroke="#a27a50"
              strokeOpacity=".35"
            />
          </g>
        )}
        {art === 'glass' && (
          <>
            <g opacity=".8">
              <path d="M66 92h85l-8 121q-34 11-68 0z" />
              <ellipse cx="108" cy="92" rx="43" ry="10" fill="#e1e8e0" />
              <path d="M169 77h85l-7 136q-34 12-70 0z" />
              <ellipse cx="211" cy="77" rx="43" ry="10" fill="#e1e8e0" />
            </g>
            {[83, 98, 114, 130, 184, 200, 216, 232].map((x) => (
              <path key={x} d={`M${x} 106v101`} stroke="#eff3ee" strokeWidth="3" opacity=".7" />
            ))}
          </>
        )}
        {art === 'throw' && (
          <>
            <path d="M72 85l143-19 38 135-150 23z" />
            <path d="M72 85l31 139-28-9-24-118z" fill="#8e5542" />
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d={`M${82 + i * 13} ${87 - i * 1.6}l26 121`}
                stroke="#cf967d"
                strokeWidth="2"
                opacity=".4"
              />
            ))}
            {Array.from({ length: 13 }, (_, i) => (
              <path
                key={i}
                d={`M${105 + i * 11} ${222 - i * 1.7}l-1 11`}
                stroke={c}
                strokeWidth="3"
              />
            ))}
          </>
        )}
        {art === 'coffee' && (
          <>
            <path d="M114 124h86l19 77q-60 38-120 0z" />
            <path d="M205 150q60-18 39 39q-7 12-26 8" fill="none" stroke={c} strokeWidth="12" />
            <path d="M98 61h116l-37 70h-42z" />
            <ellipse cx="156" cy="61" rx="58" ry="10" fill="#eee9df" />
            <ellipse cx="156" cy="61" rx="48" ry="6" fill="#807467" />
            <path d="M119 76l24 46M146 77l5 47M190 76l-22 46" stroke="#b9b1a2" strokeWidth="2" />
          </>
        )}
        {art === 'clock' && (
          <>
            <circle cx="160" cy="140" r="90" />
            <circle cx="160" cy="140" r="82" fill="#f1eee4" />
            {Array.from({ length: 12 }, (_, i) => (
              <line
                key={i}
                x1="160"
                y1="67"
                x2="160"
                y2="74"
                stroke="#596253"
                strokeWidth="2"
                transform={`rotate(${i * 30} 160 140)`}
              />
            ))}
            <path d="M160 93v47l39 21" fill="none" stroke="#3b4b3c" strokeWidth="4" />
            <circle cx="160" cy="140" r="4" fill="#3b4b3c" />
          </>
        )}
        {art === 'pens' && (
          <g transform="rotate(25 160 140)">
            {[127, 153, 179].map((x, i) => (
              <g key={x}>
                <rect
                  x={x}
                  y="62"
                  width="11"
                  height="135"
                  rx="4"
                  fill={['#b39a6c', '#4e6251', '#c9b9a1'][i]}
                />
                <path d={`M${x} 197l5.5 16 5.5-16`} fill="#585c52" />
                <rect x={x + 7} y="71" width="3" height="31" rx="1" fill="#e0d7bc" />
              </g>
            ))}
          </g>
        )}
        {art === 'pouch' && (
          <>
            <path d="M87 107q73-17 146 0l11 106q-82 14-165 0z" />
            <path d="M87 108q73-17 146 0" fill="none" stroke="#795b42" strokeWidth="5" />
            <path d="M225 111v22h11v-22" fill="#bca16d" />
            <rect x="145" y="154" width="30" height="26" rx="2" fill="#d9bba3" />
            <text x="160" y="170" fontSize="8" textAnchor="middle" fill="#785d49">
              K.
            </text>
          </>
        )}
      </g>
    </svg>
  );
}
