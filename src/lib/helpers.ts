// import { Ref } from "octane";

// const triggerConfetti = (gold=false, money=false, ref: Ref, confettiRef: Ref) => {
//     const canvas=ref.current; if(!canvas) return; const ctx=canvas.getContext('2d'); if(!ctx) return;
//     canvas.width=window.innerWidth; canvas.height=window.innerHeight;
//     const particles:any[]=[];
//     const colors = money ? ['#f5c518','#ffd700','#fff','#85ff7a'] : gold ? ['#f5c518','#ffd700','#fff7cc','#fff','#ff8a00'] : ['#f5c518','#ff3b3b','#fff','#00e5ff','#ffd60a'];
//     const count = gold? 300 : money? 180 : 200;
//     for(let i=0;i<count;i++){
//       particles.push({
//         x: window.innerWidth/2 + (Math.random()-0.5)*280,
//         y: window.innerHeight*0.42,
//         vx: (Math.random()-0.5)*18,
//         vy: -Math.random()*14 -2,
//         size: Math.random()*9+3,
//         color: colors[Math.floor(Math.random()*colors.length)],
//         rot: Math.random()*360, rotSpeed: (Math.random()-0.5)*12,
//         life:1, decay: Math.random()*0.012+0.006,
//         shape: money ? (Math.random()>0.5?'money':'rect') : Math.random()>0.4?'rect':'circle',
//         text: money ? '₱' : null
//       });
//     }
//     let last=performance.now();
//     const animate=(now:number)=>{
//       const dt=Math.min(32,now-last)/16; last=now;
//       ctx.clearRect(0,0,canvas.width,canvas.height);
//       let alive=false;
//       particles.forEach(p=>{
//         p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=0.28*dt; p.vx*=0.993; p.rot+=p.rotSpeed*dt; p.life-=p.decay*dt;
//         if(p.life>0){ alive=true; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate((p.rot*Math.PI)/180); ctx.globalAlpha=p.life; ctx.fillStyle=p.color;
//           if(p.shape==='money'){ ctx.font=`bold ${p.size*2.2}px Geist`; ctx.fillText('₱',-p.size,p.size); }
//           else if(p.shape==='rect') ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.65);
//           else { ctx.beginPath(); ctx.arc(0,0,p.size/2,0,Math.PI*2); ctx.fill(); }
//           ctx.restore();
//         }
//       });
//       if(alive) confettiRef.current=requestAnimationFrame(animate); else ctx.clearRect(0,0,canvas.width,canvas.height);
//     };
//     if(confettiRef.current) cancelAnimationFrame(confettiRef.current);
//     confettiRef.current=requestAnimationFrame(animate);
//   };

//   const toggleNumber = (n:number) => {
//     setSelected(prev=>{
//       if(prev.includes(n)) return prev.filter(x=>x!==n);
//       if(prev.length>=required){ const copy=[...prev]; copy[copy.length-1]=n; return copy; }
//       return [...prev,n].sort((a,b)=>a-b);
//     });
//     playTone(650+Math.random()*200,0.15,'sine',0.12);
//   };
//   const quickPick=()=>{
//     const pool=Array.from({length:42},(_,i)=>i+1);
//     for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
//     setSelected(pool.slice(0,required).sort((a,b)=>a-b));
//     playTone(800,0.2,'triangle',0.14);
//   };
//   const evenOddMix=()=>{
//     const evens=Array.from({length:21},(_,i)=>(i+1)*2);
//     const odds=Array.from({length:21},(_,i)=>i*2+1);
//     const pick:number[]=[]; const needEven=Math.floor(required/2);
//     for(let i=0;i<needEven;i++){ const idx=Math.floor(Math.random()*evens.length); pick.push(evens.splice(idx,1)[0]); }
//     for(let i=pick.length;i<required;i++){ const idx=Math.floor(Math.random()*odds.length); pick.push(odds.splice(idx,1)[0]); }
//     setSelected(pick.sort((a,b)=>a-b)); playTone(700,0.18,'sine',0.13);
//   };

//   const addTicket = () => {
//     if(selected.length!==required) return;
//     const nowTime=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
//     const base: Ticket = { id:idCounterRef.current++, numbers:[...selected].sort((a,b)=>a-b), betType, required, status:'pending', hits:0, time:nowTime };
//     if(mode==='solo'){
//       setTickets(prev=>[base,...prev]);
//     } else {
//       setPlayers(prev=>prev.map((p,i)=> i===currentPlayerIdx ? {...p, tickets:[ {...base, playerId:p.id}, ...p.tickets ]} : p));
//     }
//     playTone(900,0.25,'triangle',0.16);
//     showToast(mode==='party' ? `Added for ${currentPlayer?.name}` : 'Ticket added!');
//   };

//   const addPlayer = () => {
//     if(!newPlayerName.trim()) return;
//     if(players.length>=8){ showToast('Max 8 players'); return; }
//     const col = PLAYER_COLORS[players.length % PLAYER_COLORS.length];
//     const p: Player = { id:'p'+Date.now(), name:newPlayerName.trim().slice(0,12), color:col.color, bg:col.bg, avatar:newPlayerName.trim()[0].toUpperCase(), tickets:[], winnings:0, winCount:0 };
//     setPlayers(prev=>[...prev,p]); setNewPlayerName(''); setCurrentPlayerIdx(players.length);
//     setChat(prev=>[...prev,{ id:Date.now().toString(), name:p.name, color:col.color, text:`Joined the party! 🎉`, time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }]);
//     showToast(`${p.name} joined!`);
//   };

//   const parseOfficialInput = (str:string): number[] | null => {
//     const cleaned=str.trim().replace(/\s/g,'');
//     const parts=cleaned.split(/[-,]/).map(s=>parseInt(s,10)).filter(n=>!isNaN(n));
//     if(parts.length!==6) return null;
//     if(parts.some(n=>n<1||n>42)) return null;
//     if(new Set(parts).size!==6) return null;
//     return parts;
//   };

//   const evaluateTickets = (finalDraw:number[], isOfficialDraw=false) => {
//     const sorted=[...finalDraw].sort((a,b)=>a-b);
//     const draw:Draw={ id:Date.now(), numbers:[...finalDraw], sorted, time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}), dateLabel:new Date().toLocaleDateString('en-PH',{month:'short',day:'numeric'}), isOfficial:isOfficialDraw };
//     setDraws(prev=>[draw,...prev].slice(0,6));

//     let jackpotHit=false;
//     const wins: {ticket:Ticket; player?:Player; prize:number}[]=[];

//     const calcPrize = (t:Ticket, hits:number): { won:boolean; prize:number } => {
//       if(t.betType===6){
//         if(hits===6) return { won:true, prize:jackpot };
//         if(hits===5) return { won:true, prize:PRIZES[5] };
//         if(hits===4) return { won:true, prize:PRIZES[4] };
//         if(hits===3) return { won:true, prize:PRIZES[3] };
//         return { won:false, prize:0 };
//       } else {
//         if(hits===t.required){
//           const prize = t.betType===6? jackpot : PRIZES[t.betType];
//           return { won:true, prize };
//         }
//         return { won:false, prize:0 };
//       }
//     };

//     if(mode==='solo'){
//       setTickets(prev=>{
//         return prev.map(t=>{
//           if(t.status!=='pending') return t;
//           const hits=t.numbers.filter(n=>finalDraw.includes(n)).length;
//           const {won,prize}=calcPrize(t,hits);
//           if(won){
//             const nt={...t,hits,status:'won' as const, prizeWon:prize};
//             wins.push({ticket:nt, prize});
//             if(hits===6 && t.betType===6) jackpotHit=true;
//             return nt;
//           } else {
//             return {...t,hits,status:'lost' as const, prizeWon:0};
//           }
//         });
//       });
//     } else {
//       setPlayers(prevPlayers=>{
//         const updatedPlayers = prevPlayers.map(p=>{
//           let w= p.winnings; let wc=p.winCount;
//           const newTickets = p.tickets.map(t=>{
//             if(t.status!=='pending') return t;
//             const hits=t.numbers.filter(n=>finalDraw.includes(n)).length;
//             const {won,prize}=calcPrize(t,hits);
//             if(won){
//               w+=prize; wc+=1;
//               const nt={...t,hits,status:'won' as const, prizeWon:prize};
//               wins.push({ticket:nt, player:p, prize});
//               if(hits===6 && t.betType===6) jackpotHit=true;
//               return nt;
//             } else {
//               return {...t,hits,status:'lost' as const, prizeWon:0};
//             }
//           });
//           return {...p, tickets:newTickets, winnings:w, winCount:wc};
//         });
//         return updatedPlayers;
//       });
//     }

//     if(wins.length>0){
//       const jackpotWin = wins.find(w=>w.prize>=1000000 || (w.ticket.betType===6 && w.ticket.hits===6));
//       if(jackpotWin){
//         setWinnerJackpot(jackpotWin);
//         setWinList(wins);
//         triggerConfetti(true,false);
//         playWinSeq();
//       } else {
//         setWinList(wins);
//         triggerConfetti(false,true);
//         playTone(650,0.6,'sine',0.2); setTimeout(()=>playTone(850,0.6,'triangle',0.18),180);
//         if(wins.some(w=>w.prize>=1000)) setShowMoneyRain(true);
//       }
//     } else {
//       // no winner -> jackpot rollover
//       if(!isOfficialDraw){
//         setJackpot(prev=>{
//           const next=prev+500000+Math.floor(Math.random()*100000);
//           setJackpotAnim(true); setTimeout(()=>setJackpotAnim(false),1200);
//           return next;
//         });
//         showToast('No jackpot winner! Jackpot rolled over +₱500k');
//       }
//     }
//     setIsDrawing(false); setCurrentBallAnim(null);
//   };

//   const startDraw = (overrideNumbers?: number[]) => {
//     if(isDrawing) return;
//     setIsDrawing(true); setIsMixing(true); setDrawnBalls([]); setCurrentBallAnim(null); setWinnerJackpot(null); setWinList([]); setShowMoneyRain(false);
//     playMixRumble();

//     let finalDraw:number[];
//     if(overrideNumbers){
//       finalDraw=overrideNumbers;
//     } else {
//       const pool=Array.from({length:42},(_,i)=>i+1);
//       for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
//       finalDraw=pool.slice(0,6);
//     }

//     setTimeout(()=>{
//       setIsMixing(false);
//       let idx=0;
//       const reveal=()=>{
//         if(idx>=6){
//           evaluateTickets(finalDraw, !!overrideNumbers);
//           return;
//         }
//         const num=finalDraw[idx];
//         setDrawnBalls(prev=>[...prev,num]);
//         setCurrentBallAnim(num);
//         playTone(320+idx*70+(num%12)*10,0.55,'sine',0.22);
//         setTimeout(()=>setCurrentBallAnim(null),600);
//         idx++;
//         setTimeout(reveal,1100);
//       };
//       reveal();
//     }, 2600);
//   };
