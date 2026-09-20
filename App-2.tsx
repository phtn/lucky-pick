import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Volume2, VolumeX, Trophy, X, Zap, Dices, Clock, ExternalLink,
  Trash2, Check, Dice5, BarChart3, Users, Crown, MessageCircle,
  Link2, Play, Radio, Timer, DollarSign, Image as ImageIcon,
  Sparkles, Flame, Gift, Youtube, Globe, UserPlus,
  Coins, Wallet, PiggyBank, Receipt, HandCoins, Banknote
} from 'lucide-react';

type BetType = 1 | 2 | 3 | 4 | 5 | 6;
type GameMode = 'solo' | 'party';
type BetCost = 20 | 24 | 25;
type PrizeMode = 'official' | 'barkada';

interface Ticket {
  id: number;
  numbers: number[];
  betType: BetType;
  required: number;
  status: 'pending' | 'won' | 'lost';
  hits: number;
  time: string;
  prizeWon?: number;
  playerId?: string;
  cost: BetCost;
}

interface Draw {
  id: number;
  numbers: number[];
  sorted: number[];
  time: string;
  dateLabel: string;
  isOfficial?: boolean;
}

interface Player {
  id: string;
  name: string;
  color: string;
  bg: string;
  avatar: string;
  tickets: Ticket[];
  winnings: number;
  winCount: number;
}

interface ChatMsg {
  id: string;
  name: string;
  color: string;
  text: string;
  time: string;
}

interface OfficialResult {
  date: string;
  dateShort: string;
  numbers: number[];
  raw: string;
  jackpot: number;
  winners: number;
  jackpotFormatted: string;
}

const OFFICIAL_RESULTS: OfficialResult[] = [
  {
    date: 'Sep 19, 2026',
    dateShort: 'SEP 19 • SAT',
    numbers: [8, 27, 6, 25, 13, 22],
    raw: '08-27-06-25-13-22',
    jackpot: 50097970.39,
    winners: 0,
    jackpotFormatted: '₱50,097,970.39'
  },
  {
    date: 'Sep 17, 2026',
    dateShort: 'SEP 17 • THU',
    numbers: [8, 31, 32, 19, 24, 6],
    raw: '08-31-32-19-24-06',
    jackpot: 45831802.36,
    winners: 0,
    jackpotFormatted: '₱45,831,802.36'
  }
];

const BET_COSTS: { value: BetCost; label: string; sub: string }[] = [
  { value: 20, label: '₱20', sub: 'Classic' },
  { value: 24, label: '₱24', sub: '2023' },
  { value: 25, label: '₱25', sub: '2026 Current' },
];

const PRIZES: Record<BetType, number> = {
  6: 5940000, // base, but will use dynamic jackpot
  5: 25000,
  4: 1000,
  3: 20,
  2: 50,
  1: 10,
};

const PRIZE_LABELS: Record<BetType, string> = {
  6: '₱5,940,000+',
  5: '₱25,000',
  4: '₱1,000',
  3: '₱20',
  2: '₱50',
  1: '₱10',
};

const ODDS: Record<BetType, { label: string; odds: string; prize: string }> = {
  1: { label: '1 in 7', odds: '1 in 7', prize: PRIZE_LABELS[1] },
  2: { label: '1 in 21', odds: '1 in 21', prize: PRIZE_LABELS[2] },
  3: { label: '1 in 115', odds: '1 in 114.8', prize: PRIZE_LABELS[3] },
  4: { label: '1 in 1,111', odds: '1 in 1,111', prize: PRIZE_LABELS[4] },
  5: { label: '1 in 27,681', odds: '1 in 27,681', prize: PRIZE_LABELS[5] },
  6: { label: '1 in 5,245,786', odds: '1 in 5,245,786', prize: 'Jackpot' },
};

const BET_LABELS: Record<BetType, string> = {
  1: '1/6 Match 1',
  2: '2/6 Match 2',
  3: '3/6 Match 3',
  4: '4/6 Match 4',
  5: '5/6 Match 5',
  6: '6/6 JACKPOT',
};

const PLAYER_COLORS = [
  { color: '#f5c518', bg: 'bg-[#f5c518]', text: 'text-black', ring: 'ring-[#f5c518]' },
  { color: '#ff3b3b', bg: 'bg-[#ff3b3b]', text: 'text-white', ring: 'ring-[#ff3b3b]' },
  { color: '#00e5ff', bg: 'bg-[#00e5ff]', text: 'text-black', ring: 'ring-[#00e5ff]' },
  { color: '#a78bfa', bg: 'bg-[#a78bfa]', text: 'text-black', ring: 'ring-[#a78bfa]' },
  { color: '#34d399', bg: 'bg-[#34d399]', text: 'text-black', ring: 'ring-[#34d399]' },
  { color: '#fb7185', bg: 'bg-[#fb7185]', text: 'text-black', ring: 'ring-[#fb7185]' },
  { color: '#f97316', bg: 'bg-[#f97316]', text: 'text-white', ring: 'ring-[#f97316]' },
  { color: '#ffffff', bg: 'bg-white', text: 'text-black', ring: 'ring-white' },
];

function Ball({ n, size = 'md', glowing = false }: { n: number; size?: 'sm' | 'md' | 'lg' | 'xl'; glowing?: boolean }) {
  const dim =
    size === 'sm' ? 'w-7 h-7 text-[11px]' :
    size === 'lg' ? 'w-[56px] h-[56px] md:w-[64px] md:h-[64px] text-[17px] md:text-[19px]' :
    size === 'xl' ? 'w-[72px] h-[72px] md:w-[80px] md:h-[80px] text-[22px] md:text-[26px]' :
    'w-8 h-8 md:w-9 md:h-9 text-[12px]';
  return (
    <div
      className={`${dim} rounded-full relative flex items-center justify-center font-black tracking-tight select-none shrink-0 ${glowing ? 'shadow-[0_0_20px_rgba(245,197,24,0.85),0_0_40px_rgba(245,197,24,0.4),inset_0_2px_4px_rgba(255,255,255,0.9)] ring-2 ring-[#f5c518]/60' : 'shadow-[inset_0_2px_4px_rgba(255,255,255,0.95),inset_0_-6px_12px_rgba(0,0,0,0.28),0_3px_10px_rgba(0,0,0,0.45)]'}`}
      style={{
        background: glowing
          ? 'radial-gradient(35% 35% at 30% 25%, #fff 0%, #fff7cc 12%, #f5c518 58%, #b38700 100%)'
          : 'radial-gradient(35% 35% at 30% 28%, #fff 0%, #fdfdfd 20%, #e8e8e8 58%, #b8b8b8 100%)',
      }}
    >
      <span className="text-black leading-none" style={{ textShadow: '0 1px 0 rgba(255,255,255,0.9)' }}>{n}</span>
      <span className="absolute top-[14%] left-[18%] w-[38%] h-[28%] bg-white/75 rounded-full blur-[0.5px] pointer-events-none" />
    </div>
  );
}

function formatPeso(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: n >= 1000 ? 0 : 0, maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
}
function formatJackpot(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getNextDrawDate(): Date {
  const now = new Date();
  const d = new Date(now);
  d.setHours(21, 0, 0, 0); // 9PM Manila
  const day = d.getDay();
  const isDrawDay = [2,4,6].includes(day);
  if (isDrawDay && now < d) return d;
  for (let i = 1; i <= 7; i++) {
    const nd = new Date(now);
    nd.setDate(now.getDate() + i);
    nd.setHours(21,0,0,0);
    const ndDay = nd.getDay();
    if ([2,4,6].includes(ndDay)) return nd;
  }
  return d;
}

function genRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const nums = '0123456789';
  let code = '';
  for (let i=0;i<3;i++) code += letters[Math.floor(Math.random()*letters.length)];
  for (let i=0;i<2;i++) code += nums[Math.floor(Math.random()*nums.length)];
  return code;
}

export default function App() {
  const [mode, setMode] = useState<GameMode>('solo');
  const [betType, setBetType] = useState<BetType>(6);
  const [betCost, setBetCost] = useState<BetCost>(25);
  const [prizeMode, setPrizeMode] = useState<PrizeMode>('official');
  const [selected, setSelected] = useState<number[]>([7, 14, 21, 28, 35, 42]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [players, setPlayers] = useState<Player[]>(() => {
    const col = PLAYER_COLORS[0];
    return [{ id: 'p1', name: 'You', color: col.color, bg: col.bg, avatar: 'Y', tickets: [], winnings: 0, winCount: 0 }];
  });
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [roomCode, setRoomCode] = useState(() => genRoomCode());
  const [draws, setDraws] = useState<Draw[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isMixing, setIsMixing] = useState(false);
  const [drawnBalls, setDrawnBalls] = useState<number[]>([]);
  const [currentBallAnim, setCurrentBallAnim] = useState<number | null>(null);
  const [winnerJackpot, setWinnerJackpot] = useState<{ ticket: Ticket; player?: Player; prize: number } | null>(null);
  const [winList, setWinList] = useState<{ ticket: Ticket; player?: Player; prize: number }[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [jackpot, setJackpot] = useState(OFFICIAL_RESULTS[0].jackpot);
  const [jackpotAnim, setJackpotAnim] = useState(false);
  const [officialInput, setOfficialInput] = useState('');
  const [countdown, setCountdown] = useState({ d:0,h:0,m:0,s:0,label:'' });
  const [showIframe, setShowIframe] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [chat, setChat] = useState<ChatMsg[]>([
    { id:'1', name:'Kim', color:'#f5c518', text:'Good luck everyone! 🎉', time:'9:00 PM' },
    { id:'2', name:'Alex', color:'#00e5ff', text:'I feel 27 is coming!', time:'9:01 PM' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [showMoneyRain, setShowMoneyRain] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [rolloverPot, setRolloverPot] = useState(0);
  const [payoutBoard, setPayoutBoard] = useState<null | {
    totalPot: number;
    rolloverIncluded: number;
    jackpotPool: number;
    fivePool: number;
    fourPool: number;
    betBackTotal: number;
    winners6: any[];
    winners5: any[];
    winners4: any[];
    winners3: any[];
    rolloverNext: number;
    distributions: { ticket: Ticket; player?: Player; prize: number; hits: number }[];
    settlement: { playerId: string; name: string; spent: number; won: number; net: number }[];
    isBarkada: boolean;
  }>(null);
  const [settlementPaid, setSettlementPaid] = useState<Record<string, boolean>>({});

  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const confettiRef = useRef<number | null>(null);
  const idCounterRef = useRef(1);
  const voiceIdRef = useRef(0);
  const voiceMapRef = useRef<Map<number, { osc: OscillatorNode; gain: GainNode }>>(new Map());

  const required = betType;
  const currentPlayer = players[currentPlayerIdx];

  useEffect(()=>{
    if(mode==='party') setPrizeMode('barkada');
    else setPrizeMode('official');
  },[mode]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(()=>setToast(null), 2400);
  };

  const getAudio = () => {
    if (!audioCtxRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = 0.45;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 30; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.25;
      master.connect(comp).connect(ctx.destination);
      audioCtxRef.current = ctx;
      masterGainRef.current = master;
    }
    const ctx = audioCtxRef.current!;
    if (ctx.state !== 'running') ctx.resume();
    try { if ((navigator as any).audioSession) (navigator as any).audioSession.type = 'playback'; } catch {}
    return ctx;
  };

  useEffect(()=>{
    const onVis = () => { if (document.visibilityState==='visible' && audioCtxRef.current?.state!=='running') audioCtxRef.current?.resume(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onVis);
    return ()=>{ document.removeEventListener('visibilitychange',onVis); window.removeEventListener('pageshow',onVis); if(confettiRef.current) cancelAnimationFrame(confettiRef.current); };
  },[]);

  // read room code from URL hash like #KIM42
  useEffect(()=>{
    const h = window.location.hash.replace('#','').trim().toUpperCase();
    if (h && /^[A-Z]{3}[0-9]{2}$/.test(h.slice(0,5))) {
      setRoomCode(h.slice(0,5));
    } else if (h && h.length>=5 && h.length<=10) {
      // support longer but show first 5 as code
      const m = h.match(/[A-Z]{3}[0-9]{2}/);
      if (m) setRoomCode(m[0]);
    }
  },[]);

  // countdown timer
  useEffect(()=>{
    const tick = () => {
      const next = getNextDrawDate();
      const diff = next.getTime() - Date.now();
      const d = Math.floor(diff / (1000*60*60*24));
      const h = Math.floor((diff % (1000*60*60*24)) / (1000*60*60));
      const m = Math.floor((diff % (1000*60*60)) / (1000*60));
      const s = Math.floor((diff % (1000*60)) / 1000);
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      setCountdown({ d,h,m,s,label: `${days[next.getDay()]} ${next.toLocaleDateString('en-PH',{month:'short',day:'numeric'})} 9:00 PM` });
    };
    tick();
    const iv = setInterval(tick,1000);
    return ()=>clearInterval(iv);
  },[]);

  useEffect(()=>{
    if(chatScrollRef.current){
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  },[chat]);

  const playTone = (freq: number, dur = 0.35, type: OscillatorType='sine', peak=0.18) => {
    if(!soundOn) return;
    try{
      const ctx=getAudio();
      const id=voiceIdRef.current++;
      const osc=ctx.createOscillator(); const g=ctx.createGain();
      osc.type=type; osc.frequency.value=freq;
      const now=ctx.currentTime;
      g.gain.setValueAtTime(0.0001,now); g.gain.exponentialRampToValueAtTime(peak,now+0.02); g.gain.exponentialRampToValueAtTime(0.0001,now+dur);
      osc.connect(g); g.connect(masterGainRef.current!);
      voiceMapRef.current.set(id,{osc,gain:g});
      osc.start(now); osc.stop(now+dur+0.05);
      setTimeout(()=>{ if(voiceMapRef.current.get(id)?.osc===osc) voiceMapRef.current.delete(id); },(dur+0.15)*1000);
    }catch{}
  };
  const playMixRumble=()=>{
    if(!soundOn) return;
    try{
      const ctx=getAudio(); const osc=ctx.createOscillator(); const g=ctx.createGain();
      osc.type='sawtooth'; osc.frequency.setValueAtTime(90,ctx.currentTime); osc.frequency.linearRampToValueAtTime(60,ctx.currentTime+2.8);
      g.gain.setValueAtTime(0.0001,ctx.currentTime); g.gain.linearRampToValueAtTime(0.08,ctx.currentTime+0.2); g.gain.linearRampToValueAtTime(0.04,ctx.currentTime+2.8); g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+3);
      osc.connect(g).connect(masterGainRef.current!); osc.start(); osc.stop(ctx.currentTime+3.1);
    }catch{}
  };
  const playWinSeq=()=>{
    if(!soundOn) return;
    [261,329,392,523,659,784,1046].forEach((f,i)=> setTimeout(()=>playTone(f,0.8,i%2?'triangle':'sine',0.22), i*100));
  };

  const triggerConfetti = (gold=false, money=false) => {
    const canvas=canvasRef.current; if(!canvas) return; const ctx=canvas.getContext('2d'); if(!ctx) return;
    canvas.width=window.innerWidth; canvas.height=window.innerHeight;
    const particles:any[]=[];
    const colors = money ? ['#f5c518','#ffd700','#fff','#85ff7a'] : gold ? ['#f5c518','#ffd700','#fff7cc','#fff','#ff8a00'] : ['#f5c518','#ff3b3b','#fff','#00e5ff','#ffd60a'];
    const count = gold? 300 : money? 180 : 200;
    for(let i=0;i<count;i++){
      particles.push({
        x: window.innerWidth/2 + (Math.random()-0.5)*280,
        y: window.innerHeight*0.42,
        vx: (Math.random()-0.5)*18,
        vy: -Math.random()*14 -2,
        size: Math.random()*9+3,
        color: colors[Math.floor(Math.random()*colors.length)],
        rot: Math.random()*360, rotSpeed: (Math.random()-0.5)*12,
        life:1, decay: Math.random()*0.012+0.006,
        shape: money ? (Math.random()>0.5?'money':'rect') : Math.random()>0.4?'rect':'circle',
        text: money ? '₱' : null
      });
    }
    let last=performance.now();
    const animate=(now:number)=>{
      const dt=Math.min(32,now-last)/16; last=now;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      let alive=false;
      particles.forEach(p=>{
        p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=0.28*dt; p.vx*=0.993; p.rot+=p.rotSpeed*dt; p.life-=p.decay*dt;
        if(p.life>0){ alive=true; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate((p.rot*Math.PI)/180); ctx.globalAlpha=p.life; ctx.fillStyle=p.color;
          if(p.shape==='money'){ ctx.font=`bold ${p.size*2.2}px Geist`; ctx.fillText('₱',-p.size,p.size); }
          else if(p.shape==='rect') ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.65);
          else { ctx.beginPath(); ctx.arc(0,0,p.size/2,0,Math.PI*2); ctx.fill(); }
          ctx.restore();
        }
      });
      if(alive) confettiRef.current=requestAnimationFrame(animate); else ctx.clearRect(0,0,canvas.width,canvas.height);
    };
    if(confettiRef.current) cancelAnimationFrame(confettiRef.current);
    confettiRef.current=requestAnimationFrame(animate);
  };

  const toggleNumber = (n:number) => {
    setSelected(prev=>{
      if(prev.includes(n)) return prev.filter(x=>x!==n);
      if(prev.length>=required){ const copy=[...prev]; copy[copy.length-1]=n; return copy; }
      return [...prev,n].sort((a,b)=>a-b);
    });
    playTone(650+Math.random()*200,0.15,'sine',0.12);
  };
  const quickPick=()=>{
    const pool=Array.from({length:42},(_,i)=>i+1);
    for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
    setSelected(pool.slice(0,required).sort((a,b)=>a-b));
    playTone(800,0.2,'triangle',0.14);
  };
  const evenOddMix=()=>{
    const evens=Array.from({length:21},(_,i)=>(i+1)*2);
    const odds=Array.from({length:21},(_,i)=>i*2+1);
    const pick:number[]=[]; const needEven=Math.floor(required/2);
    for(let i=0;i<needEven;i++){ const idx=Math.floor(Math.random()*evens.length); pick.push(evens.splice(idx,1)[0]); }
    for(let i=pick.length;i<required;i++){ const idx=Math.floor(Math.random()*odds.length); pick.push(odds.splice(idx,1)[0]); }
    setSelected(pick.sort((a,b)=>a-b)); playTone(700,0.18,'sine',0.13);
  };

  const addTicket = () => {
    if(selected.length!==required) return;
    const nowTime=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    const base: Ticket = { id:idCounterRef.current++, numbers:[...selected].sort((a,b)=>a-b), betType, required, status:'pending', hits:0, time:nowTime };
    if(mode==='solo'){
      setTickets(prev=>[base,...prev]);
    } else {
      setPlayers(prev=>prev.map((p,i)=> i===currentPlayerIdx ? {...p, tickets:[ {...base, playerId:p.id}, ...p.tickets ]} : p));
    }
    playTone(900,0.25,'triangle',0.16);
    showToast(mode==='party' ? `Added for ${currentPlayer?.name}` : 'Ticket added!');
  };

  const addPlayer = () => {
    if(!newPlayerName.trim()) return;
    if(players.length>=8){ showToast('Max 8 players'); return; }
    const col = PLAYER_COLORS[players.length % PLAYER_COLORS.length];
    const p: Player = { id:'p'+Date.now(), name:newPlayerName.trim().slice(0,12), color:col.color, bg:col.bg, avatar:newPlayerName.trim()[0].toUpperCase(), tickets:[], winnings:0, winCount:0 };
    setPlayers(prev=>[...prev,p]); setNewPlayerName(''); setCurrentPlayerIdx(players.length);
    setChat(prev=>[...prev,{ id:Date.now().toString(), name:p.name, color:col.color, text:`Joined the party! 🎉`, time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }]);
    showToast(`${p.name} joined!`);
  };

  const parseOfficialInput = (str:string): number[] | null => {
    const cleaned=str.trim().replace(/\s/g,'');
    const parts=cleaned.split(/[-,]/).map(s=>parseInt(s,10)).filter(n=>!isNaN(n));
    if(parts.length!==6) return null;
    if(parts.some(n=>n<1||n>42)) return null;
    if(new Set(parts).size!==6) return null;
    return parts;
  };

  const evaluateTickets = (finalDraw:number[], isOfficialDraw=false) => {
    const sorted=[...finalDraw].sort((a,b)=>a-b);
    const draw:Draw={ id:Date.now(), numbers:[...finalDraw], sorted, time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}), dateLabel:new Date().toLocaleDateString('en-PH',{month:'short',day:'numeric'}), isOfficial:isOfficialDraw };
    setDraws(prev=>[draw,...prev].slice(0,6));

    let jackpotHit=false;
    const wins: {ticket:Ticket; player?:Player; prize:number}[]=[];

    const calcPrize = (t:Ticket, hits:number): { won:boolean; prize:number } => {
      if(t.betType===6){
        if(hits===6) return { won:true, prize:jackpot };
        if(hits===5) return { won:true, prize:PRIZES[5] };
        if(hits===4) return { won:true, prize:PRIZES[4] };
        if(hits===3) return { won:true, prize:PRIZES[3] };
        return { won:false, prize:0 };
      } else {
        if(hits===t.required){
          const prize = t.betType===6? jackpot : PRIZES[t.betType];
          return { won:true, prize };
        }
        return { won:false, prize:0 };
      }
    };

    if(mode==='solo'){
      setTickets(prev=>{
        return prev.map(t=>{
          if(t.status!=='pending') return t;
          const hits=t.numbers.filter(n=>finalDraw.includes(n)).length;
          const {won,prize}=calcPrize(t,hits);
          if(won){
            const nt={...t,hits,status:'won' as const, prizeWon:prize};
            wins.push({ticket:nt, prize});
            if(hits===6 && t.betType===6) jackpotHit=true;
            return nt;
          } else {
            return {...t,hits,status:'lost' as const, prizeWon:0};
          }
        });
      });
    } else {
      setPlayers(prevPlayers=>{
        const updatedPlayers = prevPlayers.map(p=>{
          let w= p.winnings; let wc=p.winCount;
          const newTickets = p.tickets.map(t=>{
            if(t.status!=='pending') return t;
            const hits=t.numbers.filter(n=>finalDraw.includes(n)).length;
            const {won,prize}=calcPrize(t,hits);
            if(won){
              w+=prize; wc+=1;
              const nt={...t,hits,status:'won' as const, prizeWon:prize};
              wins.push({ticket:nt, player:p, prize});
              if(hits===6 && t.betType===6) jackpotHit=true;
              return nt;
            } else {
              return {...t,hits,status:'lost' as const, prizeWon:0};
            }
          });
          return {...p, tickets:newTickets, winnings:w, winCount:wc};
        });
        return updatedPlayers;
      });
    }

    if(wins.length>0){
      const jackpotWin = wins.find(w=>w.prize>=1000000 || (w.ticket.betType===6 && w.ticket.hits===6));
      if(jackpotWin){
        setWinnerJackpot(jackpotWin);
        setWinList(wins);
        triggerConfetti(true,false);
        playWinSeq();
      } else {
        setWinList(wins);
        triggerConfetti(false,true);
        playTone(650,0.6,'sine',0.2); setTimeout(()=>playTone(850,0.6,'triangle',0.18),180);
        if(wins.some(w=>w.prize>=1000)) setShowMoneyRain(true);
      }
    } else {
      // no winner -> jackpot rollover
      if(!isOfficialDraw){
        setJackpot(prev=>{
          const next=prev+500000+Math.floor(Math.random()*100000);
          setJackpotAnim(true); setTimeout(()=>setJackpotAnim(false),1200);
          return next;
        });
        showToast('No jackpot winner! Jackpot rolled over +₱500k');
      }
    }
    setIsDrawing(false); setCurrentBallAnim(null);
  };

  const startDraw = (overrideNumbers?: number[]) => {
    if(isDrawing) return;
    setIsDrawing(true); setIsMixing(true); setDrawnBalls([]); setCurrentBallAnim(null); setWinnerJackpot(null); setWinList([]); setShowMoneyRain(false);
    playMixRumble();

    let finalDraw:number[];
    if(overrideNumbers){
      finalDraw=overrideNumbers;
    } else {
      const pool=Array.from({length:42},(_,i)=>i+1);
      for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
      finalDraw=pool.slice(0,6);
    }

    setTimeout(()=>{
      setIsMixing(false);
      let idx=0;
      const reveal=()=>{
        if(idx>=6){
          evaluateTickets(finalDraw, !!overrideNumbers);
          return;
        }
        const num=finalDraw[idx];
        setDrawnBalls(prev=>[...prev,num]);
        setCurrentBallAnim(num);
        playTone(320+idx*70+(num%12)*10,0.55,'sine',0.22);
        setTimeout(()=>setCurrentBallAnim(null),600);
        idx++;
        setTimeout(reveal,1100);
      };
      reveal();
    }, 2600);
  };

  const handleUseOfficialInput = () => {
    const nums=parseOfficialInput(officialInput);
    if(!nums){ showToast('Invalid format. Use 08-27-06-25-13-22'); return; }
    showToast(`Using official draw: ${nums.join('-')}`);
    startDraw(nums);
  };

  const handleCopyInvite = async () => {
    const url=`${window.location.origin}${window.location.pathname}#${roomCode}`;
    try{ await navigator.clipboard.writeText(url); showToast(`Invite copied • Room ${roomCode}`); }
    catch{ showToast(url); }
  };

  const handleSendChat=()=>{
    if(!chatInput.trim()) return;
    const msg:ChatMsg={ id:Date.now().toString(), name:currentPlayer?.name||'You', color:currentPlayer?.color||'#f5c518', text:chatInput.trim().slice(0,120), time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) };
    setChat(prev=>[...prev.slice(-20),msg]); setChatInput('');
    if(Math.random()>0.45){
      setTimeout(()=>{
        const hype=['LETS GOOO! 🔥','Jackpot incoming!','I got 6/6 feeling!','P50M 😳','Watch 27!','Good luck! 🍀'];
        const p = players[Math.floor(Math.random()*players.length)] || currentPlayer;
        if(!p) return;
        setChat(prev=>[...prev.slice(-20),{ id:(Date.now()+1).toString(), name:p.name, color:p.color, text:hype[Math.floor(Math.random()*hype.length)], time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) }]);
      }, 900 + Math.random()*1200);
    }
  };

  const stats = useMemo(()=>{
    if(mode==='solo'){
      const total=tickets.length; const wins=tickets.filter(t=>t.status==='won').length; const rate= total? Math.round((wins/total)*100):0;
      const wonAmount=tickets.filter(t=>t.status==='won').reduce((s,t)=>s+(t.prizeWon||0),0);
      return { total,wins,rate,wonAmount };
    } else {
      const total=players.reduce((s,p)=>s+p.tickets.length,0);
      const wins=players.reduce((s,p)=>s+p.tickets.filter(t=>t.status==='won').length,0);
      const rate= total? Math.round((wins/total)*100):0;
      const wonAmount=players.reduce((s,p)=>s+p.winnings,0);
      return { total,wins,rate,wonAmount };
    }
  },[tickets,players,mode]);

  const drumBalls = useMemo(()=> Array.from({length:42},(_,i)=>{ const n=i+1; return { n, x:8+Math.random()*84, y:10+Math.random()*68, delay:Math.random()*2000, dur:2.2+Math.random()*2.4, size:16+Math.random()*11 }; }),[]);

  const sortedLeaderboard = useMemo(()=> [...players].sort((a,b)=> b.winnings - a.winnings),[players]);

  return (
    <div className="min-h-screen w-full max-w-[100vw] bg-[#0a1020] text-white selection:bg-[#f5c518]/30 overflow-x-hidden relative">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-[20%] left-[0%] w-[60%] h-[60%] bg-[#ff3b3b]/15 rounded-full blur-[120px]" />
        <div className="absolute -bottom-[10%] right-[0%] w-[70%] h-[70%] bg-[#f5c518]/10 rounded-full blur-[130px]" />
        <div className="absolute top-[30%] left-[50%] -translate-x-1/2 w-[50%] h-[40%] bg-[#1a3a6a]/30 rounded-full blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage:`radial-gradient(white 1px, transparent 1px)`, backgroundSize:'22px 22px' }} />
      </div>
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[100] max-w-full" />
      {showMoneyRain && <div className="fixed inset-0 pointer-events-none z-[90] bg-gradient-to-b from-[#f5c518]/10 to-transparent animate-[fadeIn_0.6s_ease]" />}

      <div className="relative z-10 w-full max-w-[1480px] mx-auto px-3 md:px-5 py-4 md:py-5 overflow-x-hidden">
        {/* HEADER */}
        <header className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-[13px] bg-gradient-to-br from-[#ff3b3b] to-[#a80000] border border-white/20 shadow-[0_0_20px_rgba(255,59,59,0.5),inset_0_1px_0_rgba(255,255,255,0.3)] flex items-center justify-center">
                <span className="font-black text-[19px] leading-none">6</span>
              </div>
              <div>
                <h1 className="text-[22px] md:text-[28px] font-black tracking-[-0.02em] leading-none">6/42 LOTTO • LIVE</h1>
                <p className="text-[10px] tracking-wide text-white/55 font-medium mt-1 flex items-center gap-2">
                  <span>PCSO Philippines • Tue Thu Sat 9PM</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ff3b3b]/15 border border-[#ff3b3b]/30 text-[#ff8a8a] text-[10px] font-bold"><span className="w-1.5 h-1.5 rounded-full bg-[#ff3b3b] animate-pulse" /> LIVE SIM</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex p-1 rounded-full bg-black/40 border border-white/[0.08] backdrop-blur">
                <button onClick={()=>{ setMode('solo'); showToast('Solo mode • Your tickets'); }} className={`h-8 px-4 rounded-full text-[12px] font-black tracking-wide transition ${mode==='solo' ? 'bg-white text-black shadow' : 'text-white/50 hover:text-white/80'}`}>SOLO MODE</button>
                <button onClick={()=>{ setMode('party'); showToast(`Party mode • Room ${roomCode} • ${players.length} players`); }} className={`h-8 px-4 rounded-full text-[12px] font-black tracking-wide transition flex items-center gap-1.5 ${mode==='party' ? 'bg-[#f5c518] text-black shadow-[0_0_12px_rgba(245,197,24,0.5)]' : 'text-white/50 hover:text-white/80'}`}><Users className="w-3.5 h-3.5" /> PARTY MODE</button>
              </div>
              <button onClick={()=>setSoundOn(v=>!v)} className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center hover:bg-white/[0.12] transition">
                {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-white/40" />}
              </button>
            </div>
          </div>
        </header>

        {/* OFFICIAL PCSO RESULT BANNER */}
        <div className="mb-5 rounded-[22px] bg-gradient-to-br from-[#121a32] to-[#0d1224] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#f5c518]/50 to-transparent" />
          <div className="p-4 md:p-5 grid grid-cols-1 lg:grid-cols-[1.2fr_0.9fr_1fr] gap-4">
            {/* Latest official */}
            <div className="rounded-[16px] bg-black/30 border border-[#f5c518]/20 p-4 relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#f5c518]/10 rounded-full blur-[20px]" />
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-[#ff3b3b] text-white text-[10px] font-black tracking-widest flex items-center gap-1.5 shadow-[0_0_12px_rgba(255,59,59,0.6)]"><Radio className="w-3 h-3 animate-pulse" /> OFFICIAL PCSO RESULT</span>
                  <span className="w-2 h-2 rounded-full bg-[#ff3b3b] animate-ping" />
                </div>
                <span className="text-[10px] font-bold text-white/40">{OFFICIAL_RESULTS[0].date} • 9PM DRAW</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="flex gap-1.5">
                  {OFFICIAL_RESULTS[0].numbers.map(n=> <span key={n} className="w-8 h-8 rounded-full bg-[#f5c518] text-black text-[12px] font-black flex items-center justify-center shadow-[0_0_10px_rgba(245,197,24,0.5)]">{String(n).padStart(2,'0')}</span> )}
                </div>
                <span className="text-[12px] font-mono text-white/60">{OFFICIAL_RESULTS[0].raw}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-[12px]">
                <span className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-[#f5c518]" /> Jackpot <b className="text-[#f5c518]">{OFFICIAL_RESULTS[0].jackpotFormatted}</b></span>
                <span className="text-white/50">{OFFICIAL_RESULTS[0].winners} winner(s) • Rollover</span>
              </div>
              {/* second draw */}
              <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                <span className="font-bold text-white/40">PREV {OFFICIAL_RESULTS[1].dateShort}:</span>
                <div className="flex gap-1">
                  {OFFICIAL_RESULTS[1].numbers.map(n=> <span key={n+'p'} className="w-6 h-6 rounded-full bg-white/90 text-black text-[10px] font-black flex items-center justify-center">{String(n).padStart(2,'0')}</span> )}
                </div>
                <span className="font-mono">{OFFICIAL_RESULTS[1].raw}</span>
                <span className="text-[#f5c518]/80">{OFFICIAL_RESULTS[1].jackpotFormatted}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <a href="https://www.pcso.gov.ph" target="_blank" rel="noopener" className="h-8 px-3 rounded-full bg-white text-black text-[11px] font-black flex items-center gap-1.5 hover:brightness-110 transition"><Globe className="w-3.5 h-3.5" /> PCSO.gov.ph <ExternalLink className="w-3 h-3" /></a>
                <a href="https://www.youtube.com/@pcsoofficial" target="_blank" rel="noopener" className="h-8 px-3 rounded-full bg-[#ff3b3b] text-white text-[11px] font-black flex items-center gap-1.5 hover:brightness-110 transition"><Youtube className="w-3.5 h-3.5" /> Watch Live <Play className="w-3 h-3" /></a>
              </div>
            </div>

            {/* Countdown + Jackpot */}
            <div className="rounded-[16px] bg-gradient-to-br from-[#f5c518]/15 to-[#f5c518]/5 border border-[#f5c518]/20 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black tracking-widest text-[#f5c518]/80 flex items-center gap-1"><Timer className="w-3.5 h-3.5" /> NEXT DRAW</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-white/60">{countdown.label}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    {v:countdown.d,l:'DAYS'},
                    {v:countdown.h,l:'HRS'},
                    {v:countdown.m,l:'MIN'},
                    {v:countdown.s,l:'SEC'},
                  ].map(k=>(
                    <div key={k.l} className="rounded-xl bg-black/40 border border-white/[0.06] p-2 text-center">
                      <div className="text-[18px] font-black leading-none">{String(k.v).padStart(2,'0')}</div>
                      <div className="text-[9px] font-bold text-white/40 tracking-widest mt-1">{k.l}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl bg-black/30 border border-[#f5c518]/20 p-3">
                  <p className="text-[10px] tracking-widest font-black text-white/40">CURRENT JACKPOT • ROLLOVER</p>
                  <p className={`text-[22px] font-black tracking-tight text-[#f5c518] leading-none mt-1 ${jackpotAnim ? 'animate-[jackpotUp_0.9s_ease]' : ''}`}>{formatJackpot(jackpot)}</p>
                  <p className="text-[10px] text-white/50 mt-1 flex items-center gap-1"><Flame className="w-3 h-3 text-[#ff8a00]" /> +₱500k if no winner • Base {formatPeso(PRIZES[6])}</p>
                </div>
              </div>
              <p className="mt-3 text-[10px] text-white/40 leading-[1.4]">Draws Tue/Thu/Sat 9PM Manila • Auto-refresh note • Live broadcast IBC13 / PCSO FB</p>
            </div>

            {/* Paste official + iframe */}
            <div className="rounded-[16px] bg-white/[0.04] border border-white/[0.06] p-4 flex flex-col">
              <h3 className="text-[11px] font-black tracking-widest text-white/70 mb-3 flex items-center gap-1.5"><Gift className="w-3.5 h-3.5 text-[#f5c518]" /> PLAY VS REAL RESULT</h3>
              <div className="flex gap-2">
                <input value={officialInput} onChange={e=>setOfficialInput(e.target.value)} placeholder="Paste official e.g. 08-27-06-25-13-22" className="flex-1 h-10 rounded-full bg-black/40 border border-white/10 px-4 text-[12px] font-mono placeholder:text-white/30 focus:outline-none focus:border-[#f5c518]/40 focus:ring-2 focus:ring-[#f5c518]/20 transition" />
                <button onClick={handleUseOfficialInput} className="h-10 px-4 rounded-full bg-[#f5c518] text-black text-[12px] font-black hover:brightness-110 active:scale-[0.98] transition whitespace-nowrap">Use as Draw</button>
              </div>
              <div className="mt-2 flex gap-1.5">
                <button onClick={()=>{ setOfficialInput(OFFICIAL_RESULTS[0].raw); }} className="px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-[10px] font-bold hover:bg-white/15">Fill {OFFICIAL_RESULTS[0].raw}</button>
                <button onClick={()=>setShowIframe(v=>!v)} className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold hover:bg-white/10 flex items-center gap-1"><Globe className="w-3 h-3" /> {showIframe ? 'Hide' : 'Official Source'}</button>
              </div>
              {showIframe ? (
                <div className="mt-3 rounded-[12px] overflow-hidden border border-white/10 bg-black">
                  <div className="h-7 bg-white/[0.06] border-b border-white/10 flex items-center justify-between px-3 text-[10px] font-bold text-white/60">
                    <span>Official Source • lotto-result.ph (fallback)</span>
                    <a href="https://lotto-result.ph" target="_blank" rel="noopener" className="text-[#f5c518] hover:underline">Open ↗</a>
                  </div>
                  <iframe title="lotto official" src="https://lotto-result.ph" className="w-full h-[160px] bg-white" loading="lazy" sandbox="allow-same-origin allow-scripts allow-popups" />
                </div>
              ) : (
                <p className="mt-3 text-[11px] leading-[1.4] text-white/50">Copy result from PCSO site and paste here to simulate against real draw. Works for party mode too — everyone bets on same official numbers.</p>
              )}
              <div className="mt-auto pt-3 flex items-center gap-2 text-[10px] text-white/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live feed updated Sep 19, 2026
              </div>
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[120] px-4 py-2.5 rounded-full bg-white text-black text-[13px] font-bold shadow-[0_8px_24px_rgba(0,0,0,0.4)] animate-[winnerPop_0.4s_ease]">{toast}</div>}

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr_380px] gap-4 md:gap-5 items-start">

          {/* LEFT - BET BUILDER + PRIZE LADDER */}
          <div className="order-2 xl:order-1 space-y-4">
            {mode==='party' && (
              <div className="rounded-[20px] bg-gradient-to-br from-[#1a2340] to-[#11172b] border border-white/[0.08] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-black tracking-widest flex items-center gap-1.5"><Crown className="w-4 h-4 text-[#f5c518]" /> ROOM {roomCode}</h3>
                  <button onClick={handleCopyInvite} className="h-7 px-3 rounded-full bg-white/10 border border-white/10 text-[10px] font-bold flex items-center gap-1 hover:bg-white/15 transition"><Link2 className="w-3 h-3" /> Copy Invite</button>
                </div>
                <div className="flex gap-2 mb-3">
                  <input value={newPlayerName} onChange={e=>setNewPlayerName(e.target.value)} onKeyDown={e=> e.key==='Enter' && addPlayer()} placeholder="Add player name" className="flex-1 h-9 rounded-full bg-black/40 border border-white/10 px-3.5 text-[12px] placeholder:text-white/30 focus:outline-none focus:border-[#f5c518]/40" />
                  <button onClick={addPlayer} className="w-9 h-9 rounded-full bg-[#f5c518] text-black flex items-center justify-center hover:brightness-110 active:scale-95"><UserPlus className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {players.map((p,idx)=>(
                    <button key={p.id} onClick={()=>setCurrentPlayerIdx(idx)} className={`h-8 px-3 rounded-full border text-[12px] font-bold flex items-center gap-1.5 transition ${idx===currentPlayerIdx ? 'bg-white text-black border-white shadow' : 'bg-black/30 border-white/10 text-white/60 hover:text-white hover:bg-white/10'}`}>
                      <span className={`w-5 h-5 rounded-full ${p.bg} ${PLAYER_COLORS[idx % PLAYER_COLORS.length].text} flex items-center justify-center text-[10px] font-black`}>{p.avatar}</span>
                      {p.name} <span className="text-[10px] opacity-60">{p.tickets.length}</span>
                    </button>
                  ))}
                </div>
                {players.length<8 ? <p className="mt-2 text-[10px] text-white/40">Up to 8 players • All bet on same draw</p> : <p className="mt-2 text-[10px] text-[#ff8a8a]">Room full (8/8)</p>}
              </div>
            )}

            <div className="rounded-[22px] bg-white/[0.06] backdrop-blur-xl border border-white/[0.08] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[12px] font-black tracking-[0.12em] flex items-center gap-2"><Dices className="w-4 h-4 text-[#f5c518]" /> PICK YOUR NUMBERS</h2>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-black/40 border border-white/10 text-white/70">{selected.length}/{required} SELECTED {mode==='party' && currentPlayer ? `• ${currentPlayer.name}` : ''}</span>
              </div>

              <div className="mb-3">
                <p className="text-[10px] tracking-widest text-white/40 font-bold mb-2">BET TYPE</p>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-[16px] bg-black/40 border border-white/[0.06]">
                  {([1,2,3,4,5,6] as BetType[]).map(bt=>(
                    <button key={bt} onClick={()=>{ setBetType(bt); setSelected(prev=>prev.slice(0,bt).sort((a,b)=>a-b)); }} className={`h-9 rounded-full text-[11px] font-black tracking-wide transition ${betType===bt ? 'bg-[#f5c518] text-black shadow-[0_0_12px_rgba(245,197,24,0.5)]' : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.10] hover:text-white/90'}`}>{bt}/6 {bt===6?'JACKPOT':''}</button>
                  ))}
                </div>
              </div>

              {/* Prize ladder table */}
              <div className="mb-4 rounded-[14px] overflow-hidden border border-white/[0.06] bg-black/30">
                <div className="px-3 py-2 bg-white/[0.04] flex items-center justify-between">
                  <span className="text-[10px] font-black tracking-widest text-white/50">PRIZE LADDER • REAL PCSO</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#f5c518]/15 border border-[#f5c518]/20 text-[#f5c518] font-bold">₱5.94M+ BASE</span>
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {[
                    { m:'6/6', prize:formatJackpot(jackpot), odds:'1 in 5,245,786', hl:betType===6, sub:'Jackpot rollover' },
                    { m:'5/6', prize:'₱25,000', odds:'1 in 27,681', hl:betType===5, sub:'up to ₱40,740 in some draws' },
                    { m:'4/6', prize:'₱1,000', odds:'1 in 1,111', hl:betType===4, sub:'up to ₱660-1k' },
                    { m:'3/6', prize:'₱20', odds:'1 in 115', hl:betType===3, sub:'fixed' },
                    { m:'2/6', prize:'₱50', odds:'1 in 21', hl:betType===2, sub:'party fun' },
                    { m:'1/6', prize:'₱10', odds:'1 in 7', hl:betType===1, sub:'party fun' },
                  ].map(r=>(
                    <div key={r.m} className={`grid grid-cols-[54px_1fr_92px] px-3 py-2 items-center text-[11px] ${r.hl ? 'bg-[#f5c518]/10' : ''}`}>
                      <span className={`font-black ${r.hl ? 'text-[#f5c518]' : 'text-white'}`}>{r.m}</span>
                      <span className="flex flex-col leading-tight"><span className={`font-bold ${r.hl ? 'text-[#f5c518]' : 'text-white/90'}`}>{r.prize}</span><span className="text-[9px] text-white/40">{r.sub}</span></span>
                      <span className="text-right text-[10px] text-white/50 font-mono">{r.odds}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[18px] bg-black/30 border border-white/[0.06] p-3">
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({length:42},(_,i)=>i+1).map(n=>{
                    const isSel=selected.includes(n);
                    return (
                      <button key={n} onClick={()=>toggleNumber(n)} className={`aspect-square rounded-full text-[13px] font-black transition-all relative flex items-center justify-center ${isSel ? 'bg-gradient-to-br from-[#ffe27a] to-[#f5c518] text-black shadow-[0_0_14px_rgba(245,197,24,0.7),inset_0_1px_2px_rgba(255,255,255,0.9)] scale-[1.06] z-10' : 'bg-gradient-to-br from-white to-[#d9d9d9] text-black shadow-[inset_0_1px_2px_rgba(255,255,255,1),0_2px_6px_rgba(0,0,0,0.35)] hover:scale-[1.05]'}`}>
                        {n}
                        {isSel && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#ff3b3b] rounded-full border border-white flex items-center justify-center"><Check className="w-2 h-2 text-white" /></span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button onClick={quickPick} className="h-9 rounded-full bg-white/[0.08] border border-white/10 text-[11px] font-bold hover:bg-white/[0.12] transition flex items-center justify-center gap-1"><Dice5 className="w-3.5 h-3.5" /> LUCKY PICK</button>
                <button onClick={evenOddMix} className="h-9 rounded-full bg-white/[0.08] border border-white/10 text-[11px] font-bold hover:bg-white/[0.12] transition">EVEN/ODD</button>
                <button onClick={()=>setSelected([])} className="h-9 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-bold text-white/50 hover:text-white/80 transition">CLEAR</button>
              </div>

              <div className="mt-4 rounded-[16px] bg-gradient-to-br from-[#f5c518]/15 to-[#f5c518]/5 border border-[#f5c518]/20 p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] tracking-widest font-black text-[#f5c518]/80">YOU WILL WIN</p>
                  <p className="text-[16px] font-black text-[#f5c518] tracking-tight">{betType===6 ? formatJackpot(jackpot) : PRIZE_LABELS[betType]} <span className="text-[11px] text-white/60 font-bold">if {betType===6 ? '6/6 hits' : `${betType}/${betType}`}</span></p>
                  <p className="text-[10px] text-white/50">{ODDS[betType].label} • {BET_LABELS[betType]}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#f5c518] text-black flex items-center justify-center font-black text-[14px] shadow-[0_0_18px_rgba(245,197,24,0.6)]">{betType}/6</div>
              </div>

              <button onClick={addTicket} disabled={selected.length!==required} className="mt-4 w-full h-[52px] rounded-full bg-[#f5c518] text-black font-black text-[14px] tracking-wide disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98] transition shadow-[0_0_24px_rgba(245,197,24,0.45)] flex items-center justify-center gap-2">
                <span>BET {BET_LABELS[betType]} {mode==='party' ? `• ${currentPlayer?.name}` : ''}</span>
                <span className="w-6 h-6 rounded-full bg-black text-[#f5c518] flex items-center justify-center text-[12px]">+</span>
              </button>
            </div>

            <div className="rounded-[18px] bg-white/[0.05] border border-white/[0.06] p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><BarChart3 className="w-4 h-4 text-white/60" /></div>
                <div>
                  <p className="text-[11px] font-bold tracking-wide text-white/60">SESSION</p>
                  <p className="text-[12px] font-bold">{stats.total} plays • {stats.wins} wins • {stats.rate}% • {formatPeso(stats.wonAmount)} won</p>
                </div>
              </div>
            </div>
          </div>

          {/* CENTER - DRUM */}
          <div className="order-1 xl:order-2">
            <div className="rounded-[28px] bg-white/[0.06] backdrop-blur-xl border border-white/[0.08] p-4 md:p-5 shadow-[0_12px_48px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden relative">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[75%] h-[1px] bg-gradient-to-r from-transparent via-[#f5c518]/60 to-transparent" />

              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#ff3b3b] shadow-[0_0_8px_#ff3b3b] animate-pulse" />
                    <span className="text-[11px] font-black tracking-[0.18em] text-white/70">LIVE DRUM • PCSO STYLE • 42 BALLS</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#f5c518]/15 border border-[#f5c518]/20 text-[#f5c518]">{formatJackpot(jackpot)}</span>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${isDrawing ? 'bg-red-500/20 border-red-500/30 text-red-300 animate-pulse' : 'bg-white/5 border-white/10 text-white/40'}`}>{isDrawing ? '● DRAWING' : '● READY'}</span>
                  </div>
                </div>

                <div className={`relative rounded-[24px] bg-gradient-to-b from-[#1a1f33] to-[#0e1220] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_20px_40px_rgba(0,0,0,0.5)] overflow-hidden ${isMixing ? 'animate-[drumShake_0.18s_infinite]' : ''}`}>
                  <div className="h-8 bg-gradient-to-b from-white/10 to-transparent border-b border-white/10 flex items-center justify-center gap-1.5">
                    {[...Array(12)].map((_,i)=><span key={i} className={`w-1.5 h-1.5 rounded-full ${isDrawing ? 'bg-[#f5c518] shadow-[0_0_6px_#f5c518] animate-pulse' : 'bg-white/20'}`} style={{animationDelay:`${i*80}ms`}} />)}
                  </div>
                  <div className="relative aspect-[16/11] md:aspect-[16/10] bg-gradient-to-b from-[#0a1020]/80 to-[#0a1020]/40 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none z-10" />
                    <div className="absolute top-0 left-[8%] right-[8%] h-[32%] bg-gradient-to-b from-white/10 to-transparent rounded-[50%] pointer-events-none z-10" />
                    <div className="absolute inset-[3%]">
                      {drumBalls.map(b=>(
                        <div key={b.n} className={`absolute rounded-full flex items-center justify-center font-black text-black leading-none select-none ${isMixing ? 'animate-[ballFloat_var(--dur)_ease-in-out_infinite]' : 'animate-[ballFloatSlow_var(--dur)_ease-in-out_infinite]'}`}
                          style={{
                            left:`${b.x}%`, top:`${b.y}%`, width:`${b.size}px`, height:`${b.size}px`, fontSize:`${b.size*0.42}px`,
                            background:'radial-gradient(35% 35% at 30% 28%, #fff 0%, #fefefe 20%, #e6e6e6 60%, #b5b5b5 100%)',
                            boxShadow:'inset 0 1px 2px rgba(255,255,255,0.9), 0 2px 8px rgba(0,0,0,0.35)',
                            ['--dur' as any]:`${b.dur}s`, animationDelay:`${b.delay}ms`,
                            opacity:drawnBalls.includes(b.n)?0:1,
                            transition:'opacity 0.5s ease'
                          }}>
                          {b.n}
                        </div>
                      ))}
                      {isMixing && (
                        <div className="absolute inset-0 flex items-center justify-center z-20">
                          <div className="w-[68%] h-[68%] rounded-full border border-white/10 border-dashed animate-[spin_2s_linear_infinite] opacity-40" />
                          <div className="absolute w-[42%] h-[42%] rounded-full border border-[#f5c518]/30 border-dashed animate-[spin_1.2s_linear_infinite_reverse] opacity-60" />
                          <div className="absolute px-4 py-2 rounded-full bg-black/70 border border-white/15 backdrop-blur text-[11px] font-black tracking-widest text-white">MIXING • 42 BALLS</div>
                        </div>
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-[18%] bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[38%] h-[22%] bg-gradient-to-b from-[#2a2f45] to-[#121624] border-x border-t border-white/10 rounded-t-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] z-10 flex items-start justify-center pt-2">
                      <div className="w-[70%] h-[6px] rounded-full bg-black/50 border border-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]" />
                    </div>
                  </div>

                  <div className="bg-gradient-to-b from-[#151a2d] to-[#0d111f] border-t border-white/10 p-3 md:p-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-[10px] font-black tracking-[0.18em] text-white/50">DRAWN BALLS</p>
                      <p className="text-[10px] font-bold text-white/40">{drawnBalls.length}/6 • {isDrawing ? 'DRAWING...' : drawnBalls.length===6 ? 'COMPLETE' : 'READY'} {draws[0]?.isOfficial ? '• OFFICIAL' : ''}</p>
                    </div>
                    <div className="grid grid-cols-6 gap-2 md:gap-3">
                      {Array.from({length:6},(_,i)=>{
                        const num=drawnBalls[i]; const isCurrent=currentBallAnim===num;
                        return (
                          <div key={i} className="aspect-square rounded-[18px] bg-black/40 border border-white/[0.06] flex items-center justify-center relative overflow-hidden">
                            {num ? <div className={`${isCurrent ? 'animate-[ballPop_0.6s_cubic-bezier(0.34,1.56,0.64,1)]' : 'animate-[ballIn_0.4s_ease]'}`}><Ball n={num} size="lg" glowing /></div> : <div className="w-[56%] h-[56%] rounded-full bg-white/[0.06] border border-white/[0.08] border-dashed" />}
                            {isCurrent && <div className="absolute inset-0 bg-[#f5c518]/20 animate-[ping_0.6s_ease] rounded-[18px]" />}
                          </div>
                        );
                      })}
                    </div>
                    {drawnBalls.length===6 && (
                      <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold text-white/50">SORTED RESULT:</span>
                        <div className="flex gap-1.5">
                          {[...drawnBalls].sort((a,b)=>a-b).map(n=> <span key={n} className="w-7 h-7 rounded-full bg-[#f5c518] text-black text-[11px] font-black flex items-center justify-center shadow-[0_0_10px_rgba(245,197,24,0.5)]">{n}</span>)}
                        </div>
                        <span className="text-[11px] font-mono text-white/40">{[...drawnBalls].sort((a,b)=>a-b).map(n=>String(n).padStart(2,'0')).join('-')}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <button onClick={()=>startDraw()} disabled={isDrawing} className={`group relative w-full h-[64px] md:h-[72px] rounded-[20px] font-black text-[20px] md:text-[24px] tracking-tight flex items-center justify-center gap-3 transition-all overflow-hidden ${isDrawing ? 'bg-white/10 border border-white/10 text-white/40 cursor-not-allowed' : 'bg-white text-black shadow-[0_0_32px_rgba(255,255,255,0.35),0_0_64px_rgba(245,197,24,0.25)] hover:shadow-[0_0_48px_rgba(255,255,255,0.5),0_0_80px_rgba(245,197,24,0.4)] hover:scale-[1.01] active:scale-[0.98]'}`}>
                    {!isDrawing && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -skew-x-12 translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-700" />}
                    {isDrawing ? <><span className="w-5 h-5 border-[3px] border-white/30 border-t-white rounded-full animate-spin" />{isMixing ? 'MIXING 42 BALLS...' : `DRAWING ${drawnBalls.length}/6`}</> : <><Zap className="w-6 h-6" /> START DRAW <span className="w-8 h-8 rounded-full bg-[#ff3b3b] text-white flex items-center justify-center text-[14px]">●</span></>}
                  </button>
                  <div className={`mx-auto mt-3 h-[2px] w-[60%] bg-gradient-to-r from-transparent via-[#ff3b3b] to-transparent blur-[0.5px] ${isDrawing ? 'opacity-100 animate-pulse' : 'opacity-40'}`} />
                </div>

                {/* Winner celebrations */}
                {winnerJackpot && (
                  <div className="mt-5 rounded-[20px] bg-gradient-to-br from-[#f5c518]/25 to-[#ff8a00]/25 border border-[#f5c518]/40 p-4 flex items-center gap-3 animate-[winnerPop_0.6s_cubic-bezier(0.34,1.56,0.64,1)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-[shine_1.5s_ease_infinite]" />
                    <div className="w-14 h-14 rounded-full bg-[#f5c518] text-black flex items-center justify-center shadow-[0_0_24px_rgba(245,197,24,0.8)]"><Trophy className="w-7 h-7" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black tracking-widest text-[#f5c518] flex items-center gap-1"><Sparkles className="w-3 h-3" /> JACKPOT HIT!!! {formatJackpot(winnerJackpot.prize)}</p>
                      <p className="text-[15px] font-black leading-tight">{winnerJackpot.player ? `${winnerJackpot.player.name} • ` : ''}Ticket #{winnerJackpot.ticket.id} • {winnerJackpot.ticket.numbers.join(' - ')} • 6/6</p>
                      <p className="text-[12px] text-white/70">{formatJackpot(winnerJackpot.prize)} won!</p>
                    </div>
                    <button onClick={()=>setWinnerJackpot(null)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/15 z-10"><X className="w-4 h-4" /></button>
                  </div>
                )}

                {winList.length>0 && !winnerJackpot && (
                  <div className="mt-5 rounded-[18px] bg-gradient-to-br from-emerald-500/15 to-[#f5c518]/10 border border-emerald-500/20 p-3 animate-[fadeIn_0.4s_ease]">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-black tracking-widest text-emerald-300 flex items-center gap-1.5"><Gift className="w-3.5 h-3.5" /> WINNERS • {winList.length} ticket(s) • {formatPeso(winList.reduce((s,w)=>s+w.prize,0))}</p>
                      <button onClick={()=>setWinList([])} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"><X className="w-3 h-3" /></button>
                    </div>
                    <div className="space-y-1.5 max-h-[120px] overflow-y-auto custom-scroll pr-1">
                      {winList.map((w,i)=>(
                        <div key={i} className="flex items-center justify-between text-[12px] bg-black/20 rounded-full px-3 py-1.5 border border-white/5">
                          <span className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center">{w.ticket.numbers.join(' ')}</span> {w.player ? w.player.name : ''} • {w.ticket.hits}/{w.ticket.required} {BET_LABELS[w.ticket.betType]}</span>
                          <span className="font-black text-[#f5c518]">{formatPeso(w.prize)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Draw history */}
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-[18px] bg-black/30 border border-white/[0.07] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[11px] font-black tracking-widest flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-[#f5c518]" /> DRAW HISTORY</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10">{draws.length}</span>
                    </div>
                    {draws.length===0 ? <p className="text-[12px] text-white/30 py-4 text-center">No draws yet — hit START DRAW</p> : (
                      <div className="space-y-2.5 max-h-[132px] overflow-y-auto custom-scroll pr-1">
                        {draws.map(d=>(
                          <div key={d.id} className="flex items-center justify-between gap-2">
                            <div className="flex gap-1">{d.sorted.map(n=> <span key={n} className={`w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center ${d.isOfficial ? 'bg-[#f5c518] text-black' : 'bg-white text-black'}`}>{n}</span>)}</div>
                            <span className="text-[10px] text-white/40 font-mono shrink-0">{d.time}{d.isOfficial?' • OFFICIAL':''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-[18px] bg-black/30 border border-white/[0.07] p-4">
                    <h3 className="text-[11px] font-black tracking-widest mb-2 flex items-center gap-1.5"><Dices className="w-3.5 h-3.5 text-white/60" /> HOW IT WORKS</h3>
                    <ul className="space-y-1.5 text-[11px] leading-[1.4] text-white/60">
                      <li className="flex gap-2"><span className="text-[#f5c518]">•</span> Real PCSO 6/42: 6 balls 1-42. 6/6 Jackpot starts {formatPeso(PRIZES[6])}, now {formatJackpot(jackpot)} rolling.</li>
                      <li className="flex gap-2"><span className="text-[#f5c518]">•</span> Prizes: 5/6 {formatPeso(PRIZES[5])}, 4/6 {formatPeso(PRIZES[4])}, 3/6 {formatPeso(PRIZES[3])}. Party 1/6-2/6 = {formatPeso(PRIZES[1])}/{formatPeso(PRIZES[2])} fun.</li>
                      <li className="flex gap-2"><span className="text-[#f5c518]">•</span> Paste official result to play vs real draw. Party mode shares one drum for up to 8.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="order-3 space-y-4">
            {mode==='solo' ? (
              <>
                <div className="rounded-[22px] bg-white/[0.06] backdrop-blur-xl border border-white/[0.08] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[13px] font-black tracking-[0.12em] flex items-center gap-2"><Trophy className="w-4 h-4 text-[#f5c518]" /> MY TICKETS</h2>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-[11px] font-bold">{tickets.length}</span>
                      {tickets.length>0 && <button onClick={()=>setTickets([])} className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center hover:bg-red-500/20 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </div>
                  {tickets.length===0 ? (
                    <div className="py-12 text-center rounded-[16px] bg-black/30 border border-white/[0.06] border-dashed">
                      <div className="w-12 h-12 rounded-full bg-white/[0.05] mx-auto flex items-center justify-center mb-3"><Dices className="w-5 h-5 text-white/20" /></div>
                      <p className="text-[13px] text-white/40 font-medium">No bets yet</p>
                      <p className="text-[11px] text-white/25 mt-1 px-6">Pick numbers on the left, choose bet type, then BET. Tickets auto-check on each draw with real prizes.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[520px] overflow-y-auto custom-scroll pr-1">
                      {tickets.map(t=>(
                        <div key={t.id} className={`rounded-[16px] border p-3 transition ${t.status==='won' ? 'bg-gradient-to-br from-[#f5c518]/20 to-[#f5c518]/5 border-[#f5c518]/30 shadow-[0_0_18px_rgba(245,197,24,0.25)]' : t.status==='lost' ? 'bg-white/[0.03] border-white/[0.06] opacity-70' : 'bg-white/[0.06] border-white/10'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-[10px] font-black tracking-widest px-2 py-0.5 rounded-full border ${t.status==='won' ? 'bg-[#f5c518] text-black border-[#f5c518]' : t.status==='lost' ? 'bg-white/10 text-white/40 border-white/10' : 'bg-[#f5c518]/15 text-[#f5c518] border-[#f5c518]/20'}`}>
                              {t.status==='pending' ? `${BET_LABELS[t.betType]} • PENDING` : t.status==='won' ? `WIN ${formatPeso(t.prizeWon||0)} • ${BET_LABELS[t.betType]}` : `LOST • ${t.hits}/${t.required} hits`}
                            </span>
                            <span className="text-[10px] text-white/40 font-mono">{t.time}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {t.numbers.map(n=>{
                              const isHit=draws[0]?.sorted.includes(n); const showHit=t.status!=='pending';
                              return <span key={n} className={`w-7 h-7 rounded-full text-[11px] font-black flex items-center justify-center border transition ${showHit && isHit ? 'bg-[#f5c518] text-black border-[#f5c518] shadow-[0_0_8px_rgba(245,197,24,0.6)]' : showHit ? 'bg-white/10 text-white/30 border-white/10 line-through' : 'bg-white text-black border-white'}`}>{n}</span>;
                            })}
                          </div>
                          {t.status!=='pending' && (
                            <div className="mt-2 flex items-center gap-2 text-[11px]">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center ${t.status==='won' ? 'bg-[#f5c518] text-black' : 'bg-white/10 text-white/40'}`}>{t.status==='won'?'✓':'✕'}</span>
                              <span className={t.status==='won'?'text-[#f5c518] font-bold':'text-white/50'}>{t.status==='won' ? `Won ${formatPeso(t.prizeWon||0)} — ${t.hits} hits` : `Only ${t.hits}/${t.required} matched`}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Leaderboard */}
                <div className="rounded-[22px] bg-white/[0.06] backdrop-blur-xl border border-white/[0.08] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[13px] font-black tracking-[0.12em] flex items-center gap-2"><Crown className="w-4 h-4 text-[#f5c518]" /> LEADERBOARD • {roomCode}</h2>
                    <div className="flex gap-1.5">
                      <button onClick={handleCopyInvite} className="w-7 h-7 rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center hover:bg-white/[0.12]"><Link2 className="w-3.5 h-3.5" /></button>
                      <button onClick={()=>showToast('Export as Image — coming soon! Generates PNG of results')} className="w-7 h-7 rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center hover:bg-white/[0.12]"><ImageIcon className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {sortedLeaderboard.map((p,idx)=>(
                      <div key={p.id} className={`rounded-[14px] border p-3 flex items-center gap-3 ${idx===0 ? 'bg-gradient-to-br from-[#f5c518]/20 to-[#f5c518]/5 border-[#f5c518]/30' : 'bg-black/20 border-white/[0.06]'}`}>
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black ${idx===0 ? 'bg-[#f5c518] text-black' : idx===1 ? 'bg-white/20 text-white' : idx===2 ? 'bg-amber-800/50 text-amber-200' : 'bg-white/10 text-white/40'}`}>{idx+1}</span>
                        <div className={`w-9 h-9 rounded-full ${p.bg} flex items-center justify-center font-black text-[13px] ${PLAYER_COLORS[players.findIndex(pl=>pl.id===p.id) % PLAYER_COLORS.length].text}`}>{p.avatar}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-black leading-none flex items-center gap-1.5">{p.name} {idx===0 && <Trophy className="w-3.5 h-3.5 text-[#f5c518]" />}</p>
                          <p className="text-[11px] text-white/60">{p.tickets.length} tickets • {p.winCount} wins • {formatPeso(p.winnings)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[13px] font-black text-[#f5c518]">{formatPeso(p.winnings)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-black/30 border border-white/[0.06] p-2.5 text-center">
                      <p className="text-[10px] text-white/40 font-bold tracking-widest">TOTAL POT</p>
                      <p className="text-[14px] font-black text-[#f5c518]">{formatPeso(players.reduce((s,p)=>s+p.winnings,0))}</p>
                    </div>
                    <div className="rounded-xl bg-black/30 border border-white/[0.06] p-2.5 text-center">
                      <p className="text-[10px] text-white/40 font-bold tracking-widest">PLAYERS</p>
                      <p className="text-[14px] font-black">{players.length}/8</p>
                    </div>
                  </div>
                </div>

                {/* Player tickets */}
                <div className="rounded-[22px] bg-white/[0.06] backdrop-blur-xl border border-white/[0.08] p-5">
                  <h3 className="text-[12px] font-black tracking-widest mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-white/60" /> {currentPlayer?.name}'S TICKETS • {currentPlayer?.tickets.length}</h3>
                  <div className="space-y-2 max-h-[260px] overflow-y-auto custom-scroll pr-1">
                    {(currentPlayer?.tickets||[]).length===0 ? <p className="text-[12px] text-white/30 py-6 text-center">No tickets yet for {currentPlayer?.name}</p> : currentPlayer?.tickets.map(t=>(
                      <div key={t.id} className={`rounded-[14px] border p-2.5 flex items-center justify-between ${t.status==='won' ? 'bg-[#f5c518]/15 border-[#f5c518]/30' : t.status==='lost' ? 'bg-white/[0.03] border-white/[0.05] opacity-70' : 'bg-white/[0.06] border-white/10'}`}>
                        <div className="flex gap-1">{t.numbers.map(n=> <span key={n} className={`w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center ${t.status!=='pending' && draws[0]?.sorted.includes(n) ? 'bg-[#f5c518] text-black' : 'bg-white text-black'}`}>{n}</span>)}</div>
                        <span className="text-[10px] font-bold">{t.status==='won' ? formatPeso(t.prizeWon||0) : t.status==='lost' ? `${t.hits}/${t.required}` : BET_LABELS[t.betType]}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>{ const filtered=players.map(p=> p.id===currentPlayer?.id ? {...p, tickets:[]} : p); setPlayers(filtered); showToast(`Cleared ${currentPlayer?.name}'s tickets`); }} className="mt-3 w-full h-9 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-bold hover:bg-white/[0.1] flex items-center justify-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Clear {currentPlayer?.name}'s tickets</button>
                </div>

                {/* Chat */}
                <div className="rounded-[22px] bg-gradient-to-br from-[#121a30] to-[#0a1020] border border-white/[0.08] p-4">
                  <h3 className="text-[11px] font-black tracking-widest text-white/60 mb-3 flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> PARTY CHAT • {chat.length}</h3>
                  <div ref={chatScrollRef} className="space-y-2 max-h-[160px] overflow-y-auto custom-scroll pr-1 mb-3">
                    {chat.map(m=>(
                      <div key={m.id} className="flex gap-2 text-[12px] leading-[1.35]">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0" style={{background:m.color, color: m.color==='#ffffff' || m.color==='#f5c518' || m.color==='#00e5ff' || m.color==='#34d399' ? '#000' : '#fff'}}>{m.name[0]}</span>
                        <div><span className="font-bold" style={{color:m.color}}>{m.name}</span> <span className="text-white/40 text-[10px]">{m.time}</span><br /><span className="text-white/80">{m.text}</span></div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=> e.key==='Enter' && handleSendChat()} placeholder="Say good luck!" className="flex-1 h-9 rounded-full bg-black/40 border border-white/10 px-3.5 text-[12px] placeholder:text-white/30 focus:outline-none focus:border-[#f5c518]/30" />
                    <button onClick={handleSendChat} className="w-9 h-9 rounded-full bg-[#f5c518] text-black flex items-center justify-center hover:brightness-110"><MessageCircle className="w-4 h-4" /></button>
                  </div>
                </div>
              </>
            )}

            {mode==='solo' && (
              <div className="rounded-[20px] bg-gradient-to-br from-[#121a30] to-[#0a1020] border border-white/[0.08] p-4">
                <h3 className="text-[11px] font-black tracking-widest text-white/60 mb-3 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-[#f5c518]" /> PRIZE NOTE</h3>
                <p className="text-[11px] leading-[1.5] text-white/60">Jackpot starts {formatPeso(PRIZES[6])} and rolls over. 5/6 can be up to ₱40,740, 4/6 up to ₱660-₱1,000, 3/6 ₱20 in real PCSO draws. This sim uses base tier but shows rollover. Official results above are from Sep 19 & 17 2026.</p>
              </div>
            )}
          </div>
        </div>

        <footer className="mt-8 text-center text-[11px] text-white/25 tracking-wide">
          Simulator only • Not affiliated with PCSO • No money involved • 100% local RNG • Real prizes for fun • TV game show edition
        </footer>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700;900&family=Geist+Mono:wght@500&display=swap');
        * { font-family: 'Geist', system-ui, sans-serif; }
        .font-mono { font-family: 'Geist Mono', monospace; }
        .custom-scroll::-webkit-scrollbar { width: 5px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 999px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        @keyframes drumShake { 0%{transform:translate(0,0) rotate(0deg)} 20%{transform:translate(-3px,1px) rotate(-0.5deg)} 40%{transform:translate(3px,-1px) rotate(0.5deg)} 60%{transform:translate(-2px,-1px) rotate(-0.3deg)} 80%{transform:translate(2px,1px) rotate(0.3deg)} 100%{transform:translate(0,0) rotate(0deg)} }
        @keyframes ballFloat { 0%,100%{transform:translate(0,0)} 25%{transform:translate(-6px,-10px)} 50%{transform:translate(8px,-14px)} 75%{transform:translate(-4px,-6px)} }
        @keyframes ballFloatSlow { 0%,100%{transform:translate(0,0)} 50%{transform:translate(2px,-3px)} }
        @keyframes ballPop { 0%{transform:scale(0.4) translateY(20px);opacity:0} 55%{transform:scale(1.25) translateY(-4px);opacity:1} 100%{transform:scale(1) translateY(0);opacity:1} }
        @keyframes ballIn { from{transform:scale(0.6);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes winnerPop { 0%{transform:scale(0.7) rotate(-1deg);opacity:0} 60%{transform:scale(1.08) rotate(0.5deg);opacity:1} 100%{transform:scale(1) rotate(0deg);opacity:1} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes jackpotUp { 0%{transform:scale(1)} 30%{transform:scale(1.15)} 60%{transform:scale(0.98)} 100%{transform:scale(1)} }
        @keyframes shine { 0%{transform:translateX(-120%) skewX(-12deg)} 100%{transform:translateX(200%) skewX(-12deg)} }
      `}</style>
    </div>
  );
}
import React, { useState, useRef, useEffect, useMemo } from 'react';
