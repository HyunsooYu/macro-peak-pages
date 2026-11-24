import * as THREE from './vendor/three.module.min.js';

const colors={forming:0x4b9c83,growing:0x219373,pullback:0xa07944,
  crest_watch:0xcb8d27,decline_confirmed:0xa84559,closed:0x83918a};

export function mount(container,onSelect,onLost){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.setClearColor(0xf0f7f2);
  const canvas=renderer.domElement;
  canvas.setAttribute('aria-label','봉우리 3D 지형. 사건 선택 목록으로 키보드 탐색이 가능합니다.');
  container.replaceChildren(canvas);
  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-100,100,67,-67,.01,1100);
  camera.up.set(0,0,1);
  const terrain=new THREE.Group();scene.add(terrain);
  const selector=document.getElementById('ws-terrain-pick');
  const caption=document.getElementById('ws-terrain-caption');
  const ray=new THREE.Raycaster(), pointer=new THREE.Vector2();
  const phiLimit=.10;
  let angle=-1.08,phi=.58,zoom=1,panX=0,panY=0,drag=null,meshByEvent=new Map();
  let clickable=[],signature='',frame=0,dead=false;

  function draw(){
    if(dead)return;
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      if(dead)return;
      const {width,height}=container.getBoundingClientRect();
      if(width<=0||height<=0)return;
      const aspect=width/height, span=73/zoom;
      renderer.setSize(width,height,false);
      camera.left=-span*aspect;camera.right=span*aspect;
      camera.top=span;camera.bottom=-span;camera.updateProjectionMatrix();
      const r=208*Math.cos(phi);
      camera.position.set(panX+r*Math.cos(angle),panY+r*Math.sin(angle),208*Math.sin(phi));
      camera.lookAt(panX,panY,5);
      renderer.render(scene,camera);
    });
  }
  function reset(){
    angle=-1.08;phi=.58;zoom=1;panX=0;panY=0;draw();
  }
  function free(){
    for(const item of [...terrain.children]){
      terrain.remove(item);item.geometry.dispose();item.material.dispose();
    }
    meshByEvent=new Map();clickable=[];
  }
  function material(color,opacity){
    return new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity,depthWrite:false});
  }
  function lineSegments(positions,color){
    if(!positions.length)return;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    terrain.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color})));
  }
  function update(data){
    const key=JSON.stringify([data.from,data.to,data.mode,data.lanes.map(l=>[l.id,l.events.map(e=>e.id)])]);
    const x=t=>-77+154*(t-data.from)/Math.max(1,data.to-data.from);
    let height=0;
    if(data.mode!=='structure'){
      for(const lane of data.lanes)for(const sample of lane.events)for(const run of sample.paths)
        for(const [,rise] of run)if(rise!=null)height=Math.max(height,Math.abs(rise));
    }
    const scale=data.mode==='structure'?39:Math.min(31,57/Math.max(height,.001));
    if(key!==signature){
      signature=key;free();
      const lanes=data.lanes, spacing=Math.min(7,75/Math.max(1,lanes.length));
      const y=index=>(index-(lanes.length-1)/2)*spacing;
      const start=y(0)-2,end=y(lanes.length-1)+2;
      const grid=[];
      const options=[new Option('사건 선택','')];
      for(const [i,lane] of lanes.entries()){
        grid.push(-77,y(i),0,x(data.end),y(i),0);
        for(const sample of lane.events){
          const rawColor=colors[sample.stage]??0x82948b;
          options.push(new Option(sample.name,sample.id));
          const points=[];
          for(const run of sample.paths){
            for(let j=1;j<run.length;j++){
              const [[t,a],[u,b]]=[run[j-1],run[j]];
              if(a==null||b==null||u<=data.from||t>=data.end)continue;
              const from=Math.max(t,data.from),to=Math.min(u,data.end);
              const interp=s=>a+(b-a)*(s-t)/(u-t);
              const v=x(from),w=x(to),ya=y(i);
              const h=interp(from)*scale*sample.factor,k=interp(to)*scale*sample.factor;
              points.push(v,ya,0,w,ya,0,w,ya,k,v,ya,0,w,ya,k,v,ya,h);
            }
          }
          if(!points.length)continue;
          const geometry=new THREE.BufferGeometry();
          geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
          const mesh=new THREE.Mesh(geometry,material(rawColor,.52));
          mesh.userData={id:sample.id,color:rawColor};
          terrain.add(mesh);meshByEvent.set(sample.id,mesh);clickable.push(mesh);
        }
      }
      const head=new Date(data.from);
      for(let year=head.getUTCFullYear()+1;year<=new Date(data.end).getUTCFullYear();year++){
        const c=x(Date.UTC(year,0,1));grid.push(c,start,0,c,end,0);
      }
      lineSegments(grid,0xc1d1c5);
      if(data.cutoff>=data.from&&data.cutoff<=data.to){
        const c=x(data.cutoff);lineSegments([c,start,0,c,end,0,c,start,0,c,start,25],0x1b5b4c);
      }
      selector.replaceChildren(...options);
      caption.textContent=data.dateLabel(data.from)+' – '+data.dateLabel(data.end)+
        ' 실측 · X 실제 날짜 · Y 자산 레인 · Z '+(data.mode==='structure'?
        '레인별 형태 확대, 높이 비교 불가':'시작 가격 대비 자연로그')+' · 드래그 회전 / Shift 드래그 이동';
      container.dataset.from=new Date(data.from).toISOString();
      container.dataset.to=new Date(data.to).toISOString();
      container.dataset.meshes=String(clickable.length);
    }
    for(const [id,mesh] of meshByEvent){
      const selected=id===data.selected;
      mesh.material.opacity=selected?1:(data.selected?.length ? .29 : .63);
      mesh.material.color.setHex(selected?0x035e66:mesh.userData.color);
      mesh.renderOrder=selected?2:0;
    }
    selector.value=data.selected??'';
    container.dataset.selected=data.selected??'';
    draw();
  }
  function click(event){
    const rect=canvas.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)*2/rect.width-1,1-(event.clientY-rect.top)*2/rect.height);
    ray.setFromCamera(pointer,camera);
    const picked=ray.intersectObjects(clickable,false)[0];
    if(picked)onSelect(picked.object.userData.id);
  }
  canvas.addEventListener('pointerdown',e=>{
    drag={x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(Math.abs(dx)+Math.abs(dy)>1)drag.moved=true;
    if(e.shiftKey){panX-=dx*.21/zoom;panY+=dy*.21/zoom;}
    else{angle-=dx*.009;phi=Math.min(Math.PI/2-phiLimit,Math.max(phiLimit,phi+dy*.007));}
    drag.x=e.clientX;drag.y=e.clientY;draw();
  });
  canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved)click(e);drag=null;});
  canvas.addEventListener('pointercancel',()=>{drag=null;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.min(3,Math.max(.55,zoom*Math.exp(-e.deltaY*.001)));draw();},
    {passive:false});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onLost();});
  selector.onchange=()=>{if(selector.value)onSelect(selector.value);};
  const resize=new ResizeObserver(draw);resize.observe(container);
  return {update,reset,destroy(){dead=true;cancelAnimationFrame(frame);resize.disconnect();free();renderer.dispose();
    selector.onchange=null;container.replaceChildren();}};
}
