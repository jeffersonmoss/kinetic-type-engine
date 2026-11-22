// Readable, deterministic SVG diagnostics; SVGs can be generated without a browser.
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const mul=(a,k)=>a.map(x=>x*k);
const number=n=>Number(n.toFixed(3));
const header=(w,h)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#111"/><g font-family="sans-serif" fill="#eee">`;
export function plaqueSheet(scene) {
  const cellW=400,cellH=300,cols=3,rows=Math.ceil(scene.plaques.length/cols);
  let svg=header(cellW*cols,cellH*rows);
  scene.plaques.forEach((p,i)=>{
    const x=(i%cols)*cellW,y=Math.floor(i/cols)*cellH,s=Math.min(340/p.w,210/p.h),cx=x+cellW/2,cy=y+135;
    svg+=`<text x="${x+10}" y="${y+20}" font-size="13">${escape(p.id)} - shot ${escape(p.shot)} - ${escape(p.surface)}</text>`;
    svg+=`<rect x="${number(cx-p.w*s/2)}" y="${number(cy-p.h*s/2)}" width="${number(p.w*s)}" height="${number(p.h*s)}" fill="#262b40" stroke="#a0a7c5"/>`;
    for(const w of scene.words.filter(w=>w.plaque===p.id)) {
      const d=sub(w.C,p.C),u=dot(d,p.R),v=dot(d,p.U),rx=dot(w.R,p.R),ry=dot(w.R,p.U),ux=dot(w.U,p.R),uy=dot(w.U,p.U);
      const wScreen=(Math.abs(rx)*w.w+Math.abs(ux)*w.h)*s,hScreen=(Math.abs(ry)*w.w+Math.abs(uy)*w.h)*s;
      const px=cx+u*s,py=cy-v*s;
      svg+=`<rect x="${number(px-wScreen/2)}" y="${number(py-hScreen/2)}" width="${number(wScreen)}" height="${number(hScreen)}" fill="none" stroke="#fff" stroke-width="1"/>`;
      svg+=`<text x="${number(px)}" y="${number(py)}" text-anchor="middle" font-size="${number(Math.max(6,Math.min(14,hScreen*.35)))}">${escape(w.text)}</text>`;
      svg+=`<text x="${number(px)}" y="${number(py+10)}" text-anchor="middle" font-size="7">${escape(w.slot??w.font)} cap ${number(w.cap)}${w.rowScale!=null?' scale '+number(w.rowScale):''}</text>`;
    }
  });
  return svg+'</g></svg>\n';
}
function corners(p) {
  const points=[];
  for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5])points.push(add(p.C,add(mul(p.R,x*p.w),add(mul(p.U,y*p.h),mul(p.N,(z-.5)*p.thickness)))));
  return points;
}
export function trailSheet(scene) {
  const views=[[0,1,'X / Y'],[0,2,'X / Z'],[2,1,'Z / Y']],cellW=500,cellH=400;
  const all=scene.plaques.flatMap(corners);if(!all.length)return header(1500,400)+'</g></svg>\n';
  let svg=header(1500,400);
  views.forEach(([a,b,label],vi)=>{
    const minA=Math.min(...all.map(c=>c[a])),maxA=Math.max(...all.map(c=>c[a])),minB=Math.min(...all.map(c=>c[b])),maxB=Math.max(...all.map(c=>c[b]));
    const scale=Math.min(450/Math.max(1,maxA-minA),330/Math.max(1,maxB-minB));
    svg+=`<text x="${vi*cellW+10}" y="20" font-size="14">${label}</text>`;
    scene.plaques.forEach((p,i)=>{
      const pts=corners(p),loA=Math.min(...pts.map(c=>c[a])),hiA=Math.max(...pts.map(c=>c[a])),loB=Math.min(...pts.map(c=>c[b])),hiB=Math.max(...pts.map(c=>c[b]));
      const x=vi*cellW+25+(loA-minA)*scale,y=370-(hiB-minB)*scale,w=Math.max(1,(hiA-loA)*scale),h=Math.max(1,(hiB-loB)*scale);
      svg+=`<rect x="${number(x)}" y="${number(y)}" width="${number(w)}" height="${number(h)}" fill="none" stroke="#9bb1e6"/><text x="${number(x+2)}" y="${number(y+12)}" font-size="10">${i+1} ${escape(p.fold??'')}</text>`;
    });
  });
  return svg+'</g></svg>\n';
}
