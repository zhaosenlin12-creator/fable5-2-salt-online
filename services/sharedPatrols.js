'use strict';

const { randomUUID } = require('node:crypto');
const { maps } = require('../public/js/expedition-zones');
const qingyun = require('../public/js/qingyun-zone');
const { ground, blocked, houndPathClear } = require('./portalBosses');

const kinds={hound:{hp:140,speed:2.6,radius:.92,air:0,damage:7},gull:{hp:45,speed:4,radius:.78,air:5,damage:5},drone:{hp:96,speed:5.4,radius:.66,air:4.2,damage:6}};
// 队友比队长更靠前交火，机器单位选目标时给队友一点点优先权。
const EXTRA_TARGET_BIAS=4;
// 新增地图额外投放空中无人机，与机器狗组成该图的守军。
const mapKinds=map=>map==='resort'||map==='lumbermill'?['hound','gull','drone']:['hound','gull'];
const anchors={qingyun:{x:0,y:2,z:qingyun.offsetZ+9},...Object.fromEntries(Object.values(maps).map(map=>[map.id,map.landing]))};
const offsets=[[-15,-13],[15,-13],[-21,-7],[21,-7],[-15,14],[15,14]];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const body=unit=>({...unit,y:unit.y+(unit.kind==='hound'?.65:0)});
function rayHit(origin,dir,point,radius,range){
  const x=point.x-origin.x,y=point.y-origin.y,z=point.z-origin.z;
  const along=x*dir.x+y*dir.y+z*dir.z;
  const side=x*x+y*y+z*z-along*along;
  if(along<0||side>=radius*radius)return null;
  const hit=Math.max(0,along-Math.sqrt(radius*radius-side));
  return hit<range?hit:null;
}
function createSharedPatrols({players,mapKey,fire,damage,destroy,eligible,extraTargets,damageExtra}){
  const zones=new Map(Object.entries(anchors).map(([map,anchor])=>[map,mapKinds(map).map((kind,i)=>({kind,anchor,i,due:0,round:0,unit:null}))]));
  let lastTick;
  const current=new Map();
  function point(map,x,z,slot){
    return {x,z,y:ground(map,x,z,slot.anchor.y)+kinds[slot.kind].air};
  }
  function clear(map,kind,from,to){
    if(kind==='hound')return Math.abs(from.y-to.y)<1.2&&houndPathClear(map,from,to,1.25);
    return !blocked(map,from,to,.65);
  }
  function spawn(map,slot,now){
    for(let n=0;n<offsets.length;n++){
      const [x,z]=offsets[(slot.i+slot.round+n)%offsets.length];
      const home=point(map,slot.anchor.x+x,slot.anchor.z+z,slot);
      if(!clear(map,slot.kind,home,home))continue;
      slot.unit={...home,home,map,id:randomUUID(),kind:slot.kind,hp:kinds[slot.kind].hp,yaw:0,moving:false,fireAt:now+1800};
      slot.round++;
      return;
    }
    slot.due=now+3000;
  }
  function tick(now){
    const dt=lastTick===undefined?0:Math.min(.2,Math.max(0,now-lastTick)/1000);
    lastTick=now;
    current.clear();
    for(const player of players()){
      const key=mapKey(player);
      if(!zones.has(key)||!eligible(player,now))continue;
      if(!current.has(key))current.set(key,[]);
      current.get(key).push(player);
    }
    for(const [map,nearby] of current)for(const slot of zones.get(map)){
      if(!slot.unit&&now>=slot.due)spawn(map,slot,now);
      const unit=slot.unit;
      if(!unit)continue;
      const stats=kinds[unit.kind];
      const phase=now/4800+slot.i;
      const target=point(map,unit.home.x+Math.cos(phase)*4,unit.home.z+Math.sin(phase)*4,slot);
      const dx=target.x-unit.x,dz=target.z-unit.z;
      const step=Math.min(1,stats.speed*dt/(Math.hypot(dx,dz)||1));
      const next=point(map,unit.x+dx*step,unit.z+dz*step,slot);
      const yaw=Math.atan2(dx,dz);
      unit.moving=step>0&&clear(map,unit.kind,unit,{...next,yaw});
      if(unit.moving)Object.assign(unit,next,{yaw});
      if(now<unit.fireAt)continue;
      const origin=body(unit);
      // 目标候选：玩家 + 小队队友。队友在前面交火，机器单位会优先咬他们。
      const candidates=[];
      for(const p of nearby){
        if(p.protectedUntil>now)continue;
        const d=distance(origin,p.pos);
        if(d>=26)continue;
        candidates.push({kind:'player',d,pos:p.pos,ref:p});
      }
      for(const e of extraTargets?extraTargets(map):[]){
        const d=distance(origin,e);
        if(d>=26)continue;
        candidates.push({kind:'extra',d:d-EXTRA_TARGET_BIAS,pos:{x:e.x,y:e.y,z:e.z},ref:e});
      }
      candidates.sort((a,b)=>a.d-b.d);
      const victim=candidates.find(c=>!blocked(map,origin,{x:c.pos.x,y:c.pos.y+.9,z:c.pos.z}));
      if(!victim)continue;
      const end={x:victim.pos.x,y:victim.pos.y+.9,z:victim.pos.z},range=distance(origin,end);
      if(range<.1)continue;
      const dir={x:(end.x-origin.x)/range,y:(end.y-origin.y)/range,z:(end.z-origin.z)/range};
      unit.fireAt=now+1900;
      fire(unit,origin,dir,range);
      if(victim.kind==='extra')damageExtra?damageExtra(victim.ref,unit,stats.damage,now,origin):0;
      else damage(victim.ref,unit,stats.damage,now,origin);
    }
  }
  function intersect(player,origin,dir,range,now){
    const map=mapKey(player);
    if(!eligible(player,now))return null;
    let best=null;
    for(const slot of zones.get(map)||[]){
      const unit=slot.unit;
      if(!unit)continue;
      const dist=rayHit(origin,dir,body(unit),kinds[unit.kind].radius,best?.dist??range);
      if(dist===null)continue;
      const impact={x:origin.x+dir.x*dist,y:origin.y+dir.y*dist,z:origin.z+dir.z*dist};
      if(blocked(map,origin,impact))continue;
      if((current.get(map)||[]).some(other=>other!==player&&rayHit(origin,dir,{...other.pos,y:other.pos.y+.9},.53,dist)!==null))continue;
      best={slot,id:unit.id,dist};
    }
    return best;
  }
  function shoot(player,hit,profile,now){
    const {slot}=hit;
    const unit=slot.unit;
    if(!unit||unit.id!==hit.id)return false;
    unit.hp=Math.max(0,unit.hp-profile.damage);
    if(unit.hp===0){
      slot.unit=null;
      slot.due=now+(unit.map==='qingyun'?25000:12000);
      destroy(player,unit,ground(unit.map,unit.x,unit.z,slot.anchor.y),now);
    }
    return true;
  }
  function damageUnit(map,id,amount,now,shooter){
    for(const slot of zones.get(map)||[]){
      const unit=slot.unit;
      if(!unit||unit.id!==id)continue;
      unit.hp=Math.max(0,unit.hp-amount);
      if(unit.hp===0){
        slot.unit=null;
        slot.due=now+(unit.map==='qingyun'?25000:12000);
        destroy(shooter||null,unit,ground(unit.map,unit.x,unit.z,slot.anchor.y),now);
      }
      return true;
    }
    return false;
  }
  function snapshot(map){
    return (zones.get(map)||[]).flatMap(({unit})=>unit?[{
      id:unit.id,kind:unit.kind,x:unit.x,y:unit.y,z:unit.z,yaw:unit.yaw,moving:unit.moving,hp:unit.hp
    }]:[]);
  }
  return {tick,intersect,shoot,snapshot,damageUnit};
}
module.exports={createSharedPatrols};
