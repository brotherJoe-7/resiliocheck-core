const fs = require('fs');
const path = require('path');
const dirs = ['platform', 'solutions', 'documentation', 'privacy', 'terms', 'security'];

dirs.forEach(d => {
  const dirPath = path.join(__dirname, 'src/app', d);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  
  const name = d.charAt(0).toUpperCase() + d.slice(1);
  const content = `import Link from 'next/link';

export default function ${name}Page() {
  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#fafafa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <h1 style={{ fontSize: '2rem', marginBottom: 16 }}>${name}</h1>
      <p style={{ color: '#a1a1aa', marginBottom: 24 }}>This page is currently under construction.</p>
      <Link href="/" style={{ color: '#ea580c', textDecoration: 'none' }}>← Back to Home</Link>
    </div>
  );
}
`;
  
  fs.writeFileSync(path.join(dirPath, 'page.tsx'), content);
});

console.log('Done creating placeholder pages');
