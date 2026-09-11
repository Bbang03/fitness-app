import Link from 'next/link';

const letters = [
  ['01111','11000','11000','11000','11000','11000','01111'],
  ['11000','11000','11110','11011','11011','11011','11011'],
  ['00000','00000','01110','00011','01111','11011','01111'],
  ['01111','11000','11000','11011','11011','11011','01111'],
  ['01110','11011','11011','11011','11011','11011','01110'],
  ['11011','11011','11110','11100','11110','11011','11011'],
];

export function ChagokLogo() {
  return <span className="chagok-wordmark" role="img" aria-label="ChaGOK 차곡">
    {letters.map((rows, i) => <span className="chagok-glyph" aria-hidden="true" key={i}>
      {rows.join('').split('').map((bit, j) => <span key={j} className={bit === '1' ? 'chagok-pixel' : undefined} />)}
    </span>)}
  </span>;
}

export default function ChagokBrand() {
  return <div className="chagok-brandbar">
    <Link href="/dashboard" aria-label="차곡 홈"><ChagokLogo /></Link>
    <span>건강한 하루를 차곡차곡</span>
  </div>;
}
