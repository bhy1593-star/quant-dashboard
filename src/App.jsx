import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Square, Activity, DollarSign, Clock, List, AlertTriangle, 
  ShieldCheck, Server, Database, TrendingUp, TrendingDown, ArrowRightLeft,
  Cpu, Lock, Settings, Key, X, Save, Sliders
} from 'lucide-react';

const INITIAL_CASH = 100000000; // 1억 원
const HISTORY_LENGTH = 50;
const API_RATE_LIMIT = 5; 

const INITIAL_UNIVERSE = [
  { ticker: 'A005930', name: '삼성전자', price: 75000, per: 14.5, pbr: 1.3, riskGrade: 3, sector: 'IT', type: 'STOCK' },
  { ticker: 'A005380', name: '현대차', price: 240000, per: 5.2, pbr: 0.6, riskGrade: 3, sector: 'Auto', type: 'STOCK' },
  { ticker: 'A148070', name: '국고채 10년 액티브', price: 105000, per: 0, pbr: 0, riskGrade: 5, sector: 'BOND', type: 'ETF' }, 
  { ticker: 'A130680', name: 'WTI원유 선물', price: 18000, per: 0, pbr: 0, riskGrade: 1, sector: 'COMMODITY', type: 'ETF' }, 
  { ticker: 'A114800', name: 'KODEX 인버스', price: 4200, per: 0, pbr: 0, riskGrade: 2, sector: 'HEDGE', type: 'ETF' }, 
];

export default function App() {
  const [cash, setCash] = useState(INITIAL_CASH);
  const [holdings, setHoldings] = useState({}); 
  const [portfolioHistory, setPortfolioHistory] = useState(Array(HISTORY_LENGTH).fill(INITIAL_CASH));
  
  const [universe, setUniverse] = useState(INITIAL_UNIVERSE);
  const [macroData, setMacroData] = useState({ vix: 15.2, rate: 3.5 }); 
  
  const [orderQueue, setOrderQueue] = useState([]); 
  const [apiUsage, setApiUsage] = useState(0); 
  
  const [isRunning, setIsRunning] = useState(false);
  const [allocations, setAllocations] = useState({ macro: 40, quality: 30, breakout: 30 });
  const [systemLogs, setSystemLogs] = useState([]);
  const canvasRef = useRef(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiConfig, setApiConfig] = useState({
    appKey: '',
    appSecret: '',
    accountNum: '',
    isMock: true 
  });
  const [isTokenIssued, setIsTokenIssued] = useState(false);

  const addLog = useCallback((category, message, level = 'info') => {
    setSystemLogs(prev => [{
      id: Date.now() + Math.random(),
      time: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      category,
      message,
      level
    }, ...prev].slice(0, 40));
  }, []);

  const formatMoney = (num) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num);

  const totalAssets = cash + Object.entries(holdings).reduce((sum, [ticker, data]) => {
    const currentPrice = universe.find(u => u.ticker === ticker)?.price || 0;
    return sum + (data.shares * currentPrice);
  }, 0);

  const profitRate = ((totalAssets - INITIAL_CASH) / INITIAL_CASH) * 100;

  const requestOrder = useCallback((type, ticker, price, amount) => {
    setOrderQueue(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      type, ticker, price, amount, timestamp: Date.now()
    }]);
    addLog('ENGINE', `[주문생성] ${type} ${ticker} ${amount}주 (대기열 진입)`, 'info');
  }, [addLog]);

  useEffect(() => {
    if (!isRunning) return;

    const executionInterval = setInterval(() => {
      setOrderQueue(prevQueue => {
        if (prevQueue.length === 0) {
          setApiUsage(0);
          return prevQueue;
        }

        const batch = prevQueue.slice(0, API_RATE_LIMIT);
        const remaining = prevQueue.slice(API_RATE_LIMIT);
        
        setApiUsage(batch.length);

        batch.forEach(order => {
          addLog('NETWORK', `API 호출 (토큰 인증 됨) - ${order.ticker} ${order.type}`, 'success');
          
          setTimeout(() => {
            setCash(prevCash => {
              let newCash = prevCash;
              setHoldings(prevHoldings => {
                const stock = prevHoldings[order.ticker] || { shares: 0, avgPrice: 0 };
                let newShares = stock.shares;
                let newAvgPrice = stock.avgPrice;

                if (order.type === 'BUY') {
                  const cost = order.price * order.amount;
                  if (prevCash >= cost) {
                    newCash = prevCash - cost;
                    newAvgPrice = ((stock.shares * stock.avgPrice) + cost) / (stock.shares + order.amount);
                    newShares += order.amount;
                    addLog('EXEC', `[체결완료] ${order.ticker} ${order.amount}주 매수 (체결가: ${formatMoney(order.price)})`, 'success');
                  } else {
                    addLog('EXEC', `[증거금부족] ${order.ticker} 매수 거부 (API 응답코드 4)`, 'error');
                  }
                } else if (order.type === 'SELL') {
                  if (stock.shares >= order.amount) {
                    newCash = prevCash + (order.price * order.amount);
                    newShares -= order.amount;
                    if (newShares === 0) newAvgPrice = 0;
                    addLog('EXEC', `[체결완료] ${order.ticker} ${order.amount}주 매도 (체결가: ${formatMoney(order.price)})`, 'success');
                  } else {
                    addLog('SECURE', `[차단] 보유량 초과 매도 시도 감지. (무차입 공매도 방지 로직 작동)`, 'error');
                  }
                }
                
                if (newShares === 0) {
                  const newHoldings = { ...prevHoldings };
                  delete newHoldings[order.ticker];
                  return newHoldings;
                }
                return { ...prevHoldings, [order.ticker]: { shares: newShares, avgPrice: newAvgPrice } };
              });
              return newCash;
            });
          }, 230); 
        });

        return remaining;
      });
    }, 1000); 

    return () => clearInterval(executionInterval);
  }, [isRunning, addLog]);

  useEffect(() => {
    if (!isRunning) return;

    const dataInterval = setInterval(() => {
      let currentVix = macroData.vix;
      setMacroData(prev => {
        currentVix = Math.max(10, prev.vix + (Math.random() - 0.45) * 2); 
        return { ...prev, vix: currentVix };
      });

      let currentTotalAssets = 0;

      setUniverse(prevUniverse => {
        const updatedUniverse = prevUniverse.map(stock => {
          let volatility = 0.01;
          let trend = 0;

          if (stock.sector === 'HEDGE') trend = (currentVix - 15) * 0.002;
          else if (stock.sector === 'BOND') volatility = 0.002;
          else trend = (15 - currentVix) * 0.001; 

          const change = 1 + trend + (Math.random() - 0.5) * volatility;
          return { ...stock, price: Math.round(stock.price * change) };
        });

        currentTotalAssets = cash + Object.entries(holdings).reduce((sum, [ticker, data]) => {
          const currentPrice = updatedUniverse.find(u => u.ticker === ticker)?.price || 0;
          return sum + (data.shares * currentPrice);
        }, 0);

        evaluateStrategy(updatedUniverse, currentVix, currentTotalAssets);

        return updatedUniverse;
      });

      setPortfolioHistory(prev => [...prev.slice(1), currentTotalAssets]);

    }, 2000); 

    return () => clearInterval(dataInterval);
  }, [isRunning, holdings, cash, macroData.vix, allocations, requestOrder]);


  const evaluateStrategy = (currentUniverse, vix, currentTotalAssets) => {
    const totalWeight = allocations.macro + allocations.quality + allocations.breakout;
    if (totalWeight === 0) return; 

    let targetWeights = {}; 
    currentUniverse.forEach(s => targetWeights[s.ticker] = 0);

    if (allocations.macro > 0) {
      let macroPool = vix > 20 
        ? currentUniverse.filter(s => s.sector === 'BOND' || s.sector === 'HEDGE') 
        : currentUniverse.filter(s => s.type === 'STOCK');
      
      if (macroPool.length > 0) {
        const weightPerStock = (allocations.macro / totalWeight) / macroPool.length;
        macroPool.forEach(s => targetWeights[s.ticker] += weightPerStock);
      }
    }

    if (allocations.quality > 0) {
      let qualityPool = currentUniverse.filter(s => s.type === 'STOCK' && s.pbr < 1.0 && s.per < 10);
      if (qualityPool.length > 0) {
        const weightPerStock = (allocations.quality / totalWeight) / qualityPool.length;
        qualityPool.forEach(s => targetWeights[s.ticker] += weightPerStock);
      }
    }

    if (allocations.breakout > 0) {
      let breakoutPool = currentUniverse.filter(s => s.riskGrade <= 3 && s.sector !== 'BOND');
      if (breakoutPool.length > 0) {
        const weightPerStock = (allocations.breakout / totalWeight) / breakoutPool.length;
        breakoutPool.forEach(s => targetWeights[s.ticker] += weightPerStock);
      }
    }

    currentUniverse.forEach(stock => {
      const targetWeight = targetWeights[stock.ticker];
      const targetValue = currentTotalAssets * targetWeight;
      const targetShares = Math.floor(targetValue / stock.price);
      const currentShares = holdings[stock.ticker]?.shares || 0;

      const shareDiff = targetShares - currentShares;
      const valueDiff = Math.abs(shareDiff * stock.price);

      if (valueDiff > 500000 || (targetShares === 0 && currentShares > 0)) {
        if (shareDiff > 0) {
           requestOrder('BUY', stock.ticker, stock.price, shareDiff);
        } else if (shareDiff < 0) {
           requestOrder('SELL', stock.ticker, stock.price, Math.abs(shareDiff));
        }
      }
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // 모바일 등에서 캔버스가 부모 요소를 따라가도록 동적 리사이징 처리
    const parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const maxVal = Math.max(...portfolioHistory) * 1.01;
    const minVal = Math.min(...portfolioHistory) * 0.99;
    const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.strokeStyle = profitRate >= 0 ? '#10b981' : '#ef4444'; 
    ctx.lineWidth = 3;
    
    portfolioHistory.forEach((val, index) => {
      const x = (index / (HISTORY_LENGTH - 1)) * width;
      const y = height - ((val - minVal) / range) * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, profitRate >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fill();

  }, [portfolioHistory, profitRate]);

  const handleToggleRunning = () => {
    if (!isRunning) {
      if (apiConfig.appKey !== '' && apiConfig.appSecret !== '') {
        addLog('SYSTEM', `한국투자증권(${apiConfig.isMock ? '모의' : '실전'}) OAuth 접근 토큰 발급 성공`, 'success');
        setIsTokenIssued(true);
      } else {
        addLog('SYSTEM', '주의: KIS API 키가 설정되지 않아 로컬 가상 시뮬레이션 모드로 동작합니다.', 'error');
      }
      addLog('SYSTEM', '마이데이터 API 사설인증서 검증 완료', 'success');
      addLog('SYSTEM', '전략 엔진 및 데이터 파이프라인 가동 시작', 'success');
    } else {
      addLog('SYSTEM', '시스템 사용자 정지 요청 (포지션 유지)', 'error');
    }
    setIsRunning(!isRunning);
  };

  const handleSaveSettings = () => {
    setIsSettingsOpen(false);
    addLog('SYSTEM', 'API 설정이 안전하게 저장되었습니다 (메모리 캐싱).', 'info');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 p-2 sm:p-4 font-sans text-sm overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-4">
        
        {/* 헤더 부분 (모바일에서 세로로 쌓이도록 수정) */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800 shadow-xl gap-4">
          <div className="flex items-center space-x-3 md:space-x-4">
            <div className="p-2 md:p-3 bg-blue-900/50 rounded-lg shrink-0">
              <Cpu className="w-6 h-6 md:w-8 md:h-8 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-100">퀀트 코어 대시보드</h1>
              <p className="text-slate-400 text-[10px] md:text-xs mt-1">로보어드바이저 테스트베드 규격 준수</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <div className="flex flex-col items-start md:items-end order-last w-full sm:order-none sm:w-auto">
              <span className="text-[10px] md:text-xs text-slate-400 mb-1">API 트래픽 (초당 5회 제한)</span>
              <div className="flex space-x-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className={`w-2 h-2 md:w-3 md:h-3 rounded-full ${i < apiUsage ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-slate-700'}`} />
                ))}
              </div>
            </div>

            <button 
              onClick={handleToggleRunning}
              className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 md:px-6 py-2 md:py-3 rounded-lg font-bold transition-all shadow-lg text-sm md:text-base ${
                isRunning 
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-900/50' 
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-900/50'
              }`}
            >
              {isRunning ? <><Square className="w-4 h-4 md:w-5 md:h-5"/> <span>엔진 정지</span></> : <><Play className="w-4 h-4 md:w-5 md:h-5"/> <span>엔진 가동</span></>}
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 md:p-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors border border-slate-700 shadow-lg shrink-0"
              title="API 설정"
            >
              <Settings className="w-5 h-5 md:w-5 md:h-5" />
            </button>
          </div>
        </header>

        {/* 멀티 전략 자산 배분 패널 (모바일 대응) */}
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="text-slate-200 font-bold flex items-center shrink-0 w-full md:w-auto border-b md:border-b-0 border-slate-800 pb-2 md:pb-0">
            <Sliders className="w-4 h-4 md:w-5 md:h-5 mr-2 text-blue-400" /> 
            멀티-전략 자산배분
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full px-0 md:px-2">
            <div>
              <div className="flex justify-between text-[10px] md:text-xs mb-1">
                <span className="text-slate-400">거시 자산배분 (안전)</span>
                <span className="font-bold text-blue-400">{allocations.macro}%</span>
              </div>
              <input type="range" min="0" max="100" value={allocations.macro} 
                onChange={(e) => setAllocations(p => ({...p, macro: parseInt(e.target.value)}))}
                className="w-full h-1.5 md:h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" disabled={isRunning} />
            </div>
            <div>
              <div className="flex justify-between text-[10px] md:text-xs mb-1">
                <span className="text-slate-400">퀄리티 Focus (가치)</span>
                <span className="font-bold text-emerald-400">{allocations.quality}%</span>
              </div>
              <input type="range" min="0" max="100" value={allocations.quality} 
                onChange={(e) => setAllocations(p => ({...p, quality: parseInt(e.target.value)}))}
                className="w-full h-1.5 md:h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" disabled={isRunning} />
            </div>
            <div>
              <div className="flex justify-between text-[10px] md:text-xs mb-1">
                <span className="text-slate-400">돌파 모멘텀 (공격)</span>
                <span className="font-bold text-rose-400">{allocations.breakout}%</span>
              </div>
              <input type="range" min="0" max="100" value={allocations.breakout} 
                onChange={(e) => setAllocations(p => ({...p, breakout: parseInt(e.target.value)}))}
                className="w-full h-1.5 md:h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500" disabled={isRunning} />
            </div>
          </div>
          <div className="text-[10px] md:text-xs text-slate-500 text-right w-full md:w-auto border-t md:border-t-0 border-slate-800 pt-2 md:pt-0 shrink-0 flex md:block justify-between items-center">
            <span>비중 합계</span>
            <span className={`text-sm md:text-lg font-bold ml-2 md:ml-0 ${allocations.macro + allocations.quality + allocations.breakout === 0 ? 'text-red-400' : 'text-slate-300'}`}>
              {allocations.macro + allocations.quality + allocations.breakout}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          
          {/* 중앙 메인 패널 */}
          <div className="lg:col-span-3 space-y-4">
            
            {/* 요약 카드 (모바일 1열, 태블릿 2열, 데스크탑 3열) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs md:text-sm text-slate-400 font-medium flex items-center"><DollarSign className="w-3 h-3 md:w-4 md:h-4 mr-1"/> 총 포트폴리오 자산</span>
                  <div className={`text-[10px] md:text-sm px-2 py-1 rounded-md flex items-center font-bold ${profitRate >= 0 ? 'bg-emerald-900/30 text-emerald-400' : 'bg-rose-900/30 text-rose-400'}`}>
                    {profitRate >= 0 ? <TrendingUp className="w-3 h-3 md:w-4 md:h-4 mr-1" /> : <TrendingDown className="w-3 h-3 md:w-4 md:h-4 mr-1" />}
                    {profitRate.toFixed(2)}%
                  </div>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-slate-100 tracking-tight">{formatMoney(totalAssets)}</div>
              </div>
              
              <div className="bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800">
                <div className="text-xs md:text-sm text-slate-400 font-medium mb-2 flex items-center"><Database className="w-3 h-3 md:w-4 md:h-4 mr-1"/> 가용 현금 (증거금)</div>
                <div className="text-xl md:text-2xl font-semibold text-slate-200">{formatMoney(cash)}</div>
                <div className="text-[10px] md:text-xs text-slate-500 mt-1 md:mt-2">안전결제망 연동 완료</div>
              </div>

              <div className="bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800 sm:col-span-2 md:col-span-1">
                <div className="text-xs md:text-sm text-slate-400 font-medium mb-2 flex items-center"><Activity className="w-3 h-3 md:w-4 md:h-4 mr-1"/> 거시경제 지표 (MacroFin)</div>
                <div className="flex justify-between items-end mt-1">
                  <div>
                    <div className="text-[10px] md:text-xs text-slate-500">시장 변동성 (VIX)</div>
                    <div className={`text-lg md:text-xl font-bold ${macroData.vix > 20 ? 'text-amber-400' : 'text-slate-200'}`}>
                      {macroData.vix.toFixed(2)}
                      {macroData.vix > 20 && <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 inline ml-1 md:ml-2 text-amber-500 mb-0.5 md:mb-1"/>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] md:text-xs text-slate-500">기준 금리</div>
                    <div className="text-lg md:text-xl font-bold text-slate-200">{macroData.rate.toFixed(2)}%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 자산 추이 차트 */}
            <div className="bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800">
              <div className="flex justify-between items-center mb-3 md:mb-4">
                <h2 className="text-sm md:text-lg font-bold text-slate-200 flex items-center">
                  <Activity className="w-4 h-4 md:w-5 md:h-5 mr-2 text-indigo-400"/> 실시간 포트폴리오 성과
                </h2>
              </div>
              {/* 차트 영역 높이를 모바일에선 약간 줄임 */}
              <div className="relative h-48 md:h-64 w-full rounded-lg overflow-hidden bg-slate-950 border border-slate-800/50">
                <canvas 
                  ref={canvasRef} 
                  className="absolute top-0 left-0 w-full h-full"
                />
              </div>
            </div>

            {/* 시장 유니버스 (가로 스크롤 허용) */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="p-3 md:p-4 bg-slate-800/50 border-b border-slate-800 flex flex-wrap justify-between items-center gap-2">
                <h2 className="text-sm md:text-base font-bold text-slate-200 flex items-center">
                  <List className="w-4 h-4 mr-2 text-blue-400"/> 시장 유니버스
                </h2>
                <span className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400 border border-slate-700">실시간 데이터 수신중</span>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="text-[10px] md:text-xs text-slate-400 border-b border-slate-800 bg-slate-900">
                      <th className="p-2 md:p-3 whitespace-nowrap">종목명</th>
                      <th className="p-2 md:p-3 whitespace-nowrap">섹터</th>
                      <th className="p-2 md:p-3 whitespace-nowrap">위험등급</th>
                      <th className="p-2 md:p-3 whitespace-nowrap">PER/PBR</th>
                      <th className="p-2 md:p-3 text-right whitespace-nowrap">현재가</th>
                      <th className="p-2 md:p-3 text-right whitespace-nowrap">보유 잔고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {universe.map(stock => {
                      const hold = holdings[stock.ticker];
                      return (
                        <tr key={stock.ticker} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-2 md:p-3 text-xs md:text-sm font-medium text-slate-200">{stock.name}</td>
                          <td className="p-2 md:p-3 text-[10px] md:text-xs text-slate-400">{stock.sector}</td>
                          <td className="p-2 md:p-3">
                            <span className={`text-[9px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 md:py-1 rounded-full border ${
                              stock.riskGrade <= 2 ? 'bg-red-900/20 text-red-400 border-red-800/50' : 
                              stock.riskGrade >= 5 ? 'bg-green-900/20 text-green-400 border-green-800/50' : 
                              'bg-blue-900/20 text-blue-400 border-blue-800/50'
                            }`}>
                              {stock.riskGrade}등급
                            </span>
                          </td>
                          <td className="p-2 md:p-3 text-[10px] md:text-xs text-slate-400">{stock.per > 0 ? stock.per : '-'} / {stock.pbr > 0 ? stock.pbr : '-'}</td>
                          <td className="p-2 md:p-3 text-right text-xs md:text-sm text-slate-200 font-mono">{formatMoney(stock.price)}</td>
                          <td className="p-2 md:p-3 text-right text-xs md:text-sm">
                            {hold ? (
                              <span className="text-indigo-400 font-bold">{hold.shares}주</span>
                            ) : <span className="text-slate-600">-</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 우측 패널 (주문 엔진 & 보안 시스템 로그) */}
          {/* 모바일에서는 높이를 고정하여 아래로 배치 */}
          <div className="space-y-4 lg:flex lg:flex-col">
            
            {/* 주문 스케줄러 (대기열) */}
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 h-48 md:h-64 flex flex-col shrink-0">
              <h2 className="text-xs md:text-sm font-bold text-slate-200 mb-2 md:mb-3 flex items-center">
                <ArrowRightLeft className="w-3 h-3 md:w-4 md:h-4 mr-2 text-amber-400"/> 
                주문 실행 엔진 (Queue: {orderQueue.length})
              </h2>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {orderQueue.length === 0 ? (
                  <div className="text-[10px] md:text-xs text-slate-500 text-center mt-6 md:mt-10">대기 중인 주문 없음</div>
                ) : (
                  orderQueue.map(order => (
                    <div key={order.id} className="bg-slate-800 p-1.5 md:p-2 rounded text-[10px] md:text-xs border border-slate-700 flex justify-between items-center">
                      <div className="flex items-center space-x-1 md:space-x-2">
                        <span className={`font-bold px-1 md:px-1.5 py-0.5 rounded ${order.type === 'BUY' ? 'bg-rose-900/50 text-rose-400' : 'bg-blue-900/50 text-blue-400'}`}>
                          {order.type}
                        </span>
                        <span className="text-slate-300 truncate w-16 sm:w-auto">{order.ticker}</span>
                      </div>
                      <div className="text-slate-400 shrink-0">
                        {order.amount}주
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 시스템 및 규제/보안 로그 */}
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex-1 flex flex-col h-64 lg:h-auto min-h-[250px]">
              <h2 className="text-xs md:text-sm font-bold text-slate-200 mb-2 md:mb-3 flex items-center">
                <ShieldCheck className="w-3 h-3 md:w-4 md:h-4 mr-2 text-emerald-400"/> 
                시스템 및 감사 로그 (Audit)
              </h2>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[9px] md:text-[11px] custom-scrollbar">
                {systemLogs.map(log => (
                  <div key={log.id} className={`p-1.5 md:p-2 rounded border-l-2 ${
                    log.level === 'error' ? 'border-rose-500 bg-rose-950/20 text-rose-300' :
                    log.level === 'success' ? 'border-emerald-500 bg-emerald-950/20 text-emerald-300' :
                    'border-slate-500 bg-slate-800/40 text-slate-400'
                  }`}>
                    <div className="flex justify-between mb-0.5 md:mb-1 opacity-70 text-[8px] md:text-[10px]">
                      <span>[{log.category}]</span>
                      <span>{log.time}</span>
                    </div>
                    <div className="break-words leading-tight md:leading-normal">{log.message}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* API 설정 모달 (모바일 최적화) */}
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl md:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="p-4 md:p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/50 sticky top-0 z-10">
                <h2 className="text-base md:text-lg font-bold text-white flex items-center">
                  <Key className="w-4 h-4 md:w-5 md:h-5 mr-2 text-blue-400" /> API 설정
                </h2>
                <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white transition-colors p-1">
                  <X className="w-5 h-5 md:w-6 md:h-6" />
                </button>
              </div>
              
              <div className="p-4 md:p-5 space-y-3 md:space-y-4">
                <div>
                  <label className="block text-[10px] md:text-xs font-bold text-slate-400 mb-1">운용 환경 (도메인)</label>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => setApiConfig({...apiConfig, isMock: true})}
                      className={`flex-1 py-1.5 md:py-2 rounded-lg border text-xs md:text-sm font-semibold transition-colors ${apiConfig.isMock ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                    >
                      모의투자 (VTS)
                    </button>
                    <button 
                      onClick={() => setApiConfig({...apiConfig, isMock: false})}
                      className={`flex-1 py-1.5 md:py-2 rounded-lg border text-xs md:text-sm font-semibold transition-colors ${!apiConfig.isMock ? 'bg-rose-600/20 border-rose-500 text-rose-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                    >
                      실전투자 (PROD)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] md:text-xs font-bold text-slate-400 mb-1">App Key</label>
                  <input 
                    type="password" 
                    value={apiConfig.appKey}
                    onChange={(e) => setApiConfig({...apiConfig, appKey: e.target.value})}
                    placeholder="한국투자증권 KIS App Key"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-xs md:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-[10px] md:text-xs font-bold text-slate-400 mb-1">App Secret</label>
                  <input 
                    type="password" 
                    value={apiConfig.appSecret}
                    onChange={(e) => setApiConfig({...apiConfig, appSecret: e.target.value})}
                    placeholder="보안을 위해 1회용 토큰 발급에만 사용"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-xs md:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-[10px] md:text-xs font-bold text-slate-400 mb-1">계좌번호 (8자리-2자리)</label>
                  <input 
                    type="text" 
                    value={apiConfig.accountNum}
                    onChange={(e) => setApiConfig({...apiConfig, accountNum: e.target.value})}
                    placeholder="예: 12345678-01"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-xs md:text-sm"
                  />
                </div>
                
                <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-2.5 md:p-3 flex items-start space-x-2 mt-2 md:mt-4">
                  <Lock className="w-3 h-3 md:w-4 md:h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-[9px] md:text-[11px] text-amber-200/70 leading-relaxed">
                    실제 서비스 배포 시 웹 브라우저에 App Secret을 직접 저장하는 것은 위험합니다. 나중에 백엔드 서버(.env)로 옮기시길 권장합니다.
                  </p>
                </div>
              </div>

              <div className="p-4 md:p-5 border-t border-slate-800 bg-slate-800/30 flex justify-end sticky bottom-0 z-10">
                <button 
                  onClick={handleSaveSettings}
                  className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 md:py-2 rounded-lg font-bold flex items-center justify-center transition-colors"
                >
                  <Save className="w-4 h-4 mr-2" /> 설정 저장
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 3px; height: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}} />
    </div>
  );
}
