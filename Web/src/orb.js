export function initializeOrb() {
  const host=document.getElementById('orbitCoreShell');
  const canvas=document.createElement('canvas');canvas.className='alpha-orb';canvas.setAttribute('aria-hidden','true');host.append(canvas);
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const size=280,ratio=Math.min(devicePixelRatio||1,2);canvas.width=size*ratio;canvas.height=size*ratio;ctx.scale(ratio,ratio);
  let last=0,phase=0;
  function draw(now){
    requestAnimationFrame(draw);
    if(document.hidden||!host.getClientRects().length||now-last<33)return;
    const motion=document.documentElement.dataset.orbitMotion;
    const animate=motion==='full'||(!motion&&!matchMedia('(prefers-reduced-motion:reduce)').matches);
    if(animate)phase+=Math.min((now-last)/1000,.05);last=now;
    const talking=document.body.classList.contains('orbit-speaking');
    ctx.clearRect(0,0,size,size);ctx.save();ctx.translate(140,140);
    const glow=ctx.createRadialGradient(-15,-20,4,0,0,135);glow.addColorStop(0,'#1b8fdc80');glow.addColorStop(.45,'#1275bb32');glow.addColorStop(1,'#1275bb00');ctx.fillStyle=glow;ctx.fillRect(-140,-140,280,280);
    // Project latitude and longitude lines onto a rotating sphere.
    const angle=phase*.16,tilt=.35,radius=53;
    function project(lat,lon){const x=Math.cos(lat)*Math.sin(lon+angle),y=Math.sin(lat),z=Math.cos(lat)*Math.cos(lon+angle);return [radius*x,radius*(y*Math.cos(tilt)-z*Math.sin(tilt)),z*Math.cos(tilt)+y*Math.sin(tilt)];}
    const core=ctx.createRadialGradient(-18,-20,0,0,0,60);core.addColorStop(0,'#47bbeb');core.addColorStop(.45,'#104d80');core.addColorStop(1,'#04172f');ctx.fillStyle=core;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();
    function line(points){ctx.beginPath();let pen=false;for(const [x,y,z] of points){if(z<0){pen=false;continue;}if(pen)ctx.lineTo(x,y);else ctx.moveTo(x,y);pen=true;}ctx.stroke();}
    ctx.strokeStyle='#86dfff70';ctx.lineWidth=.65;
    for(let lat=-1.4;lat<1.5;lat+=.22){const points=[];for(let lon=0;lon<=6.4;lon+=.05)points.push(project(lat,lon));line(points);}
    for(let lon=0;lon<6.28;lon+=.26){const points=[];for(let lat=-1.57;lat<=1.57;lat+=.05)points.push(project(lat,lon));line(points);}
    // Specular highlight and rim shading give the sphere solid depth.
    const shine=ctx.createRadialGradient(-20,-24,0,-18,-22,25);shine.addColorStop(0,'#e5fbffbb');shine.addColorStop(.3,'#92e7ff55');shine.addColorStop(1,'#92e7ff00');ctx.fillStyle=shine;ctx.beginPath();ctx.arc(-18,-22,25,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#80dfff';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,54,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<64;i++){const a=i*Math.PI/32+phase*.07;ctx.strokeStyle=i%4?'#269bde66':'#68d4ffbb';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,78,a,a+.055);ctx.stroke();}
    for(let ring=0;ring<3;ring++){ctx.strokeStyle=['#2fa6ef90','#70d9ff65','#257ac970'][ring];ctx.lineWidth=ring===0?1.7:1;ctx.beginPath();for(let i=0;i<=240;i++){const a=i/240*Math.PI*2;const radius=100+ring*7+Math.sin(a*5+phase*(ring+1)*.5)*(talking?7:3);const x=Math.cos(a)*radius,y=Math.sin(a)*radius*(.92+ring*.02);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.closePath();ctx.stroke();}
    if(talking){ctx.strokeStyle='#54c8ff';ctx.lineWidth=2;ctx.shadowColor='#19aaff';ctx.shadowBlur=14;ctx.beginPath();ctx.arc(0,0,125,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
      ctx.fillStyle='#b9f1ff';for(let i=0;i<3;i++){const h=animate?12+Math.abs(Math.sin(phase*8+i*1.4))*26:24;ctx.beginPath();ctx.roundRect(-15+i*12,-h/2,7,h,3.5);ctx.fill();}}
    ctx.restore();
  }
  requestAnimationFrame(draw);
}

