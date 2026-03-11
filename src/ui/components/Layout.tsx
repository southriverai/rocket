// Layout component with split panes

import { ReactNode } from 'react';

export function Layout({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '400px 1fr',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          borderRight: '1px solid #ccc',
          overflowY: 'auto',
          backgroundColor: '#f5f5f5',
        }}
      >
        {left}
      </div>
      <div style={{ overflowY: 'auto', backgroundColor: '#fff' }}>{right}</div>
    </div>
  );
}
