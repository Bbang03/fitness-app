import type { CSSProperties } from 'react';
import { ChagokLogo } from './ChagokBrand';

const blocks = [[0,2,0],[1,2,1],[2,2,2],[1,1,2],[2,1,0],[2,0,1]];
const delays = [0.08,0.25,0.42,0.67,0.85,1.04];
export default function ChagokLoading() {
  return <div className="chagok-loading" role="status" aria-label="차곡 불러오는 중">
    <div className="chagok-loading-scene" aria-hidden="true">
      <div className="chagok-loading-logo"><ChagokLogo /></div>
      <div className="chagok-blocks">{blocks.map(([x,y,color],i) => <span key={i} style={{
        '--block-x':x, '--block-y':y, '--block-delay':`${delays[i]}s`,
        '--block-color':['var(--color-accent)','var(--color-brown)','var(--color-olive)'][color],
      } as CSSProperties} />)}</div>
    </div>
  </div>;
}
