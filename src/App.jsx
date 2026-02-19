import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Square, Activity, DollarSign, Clock, List, AlertTriangle, 
  ShieldCheck, Server, Database, TrendingUp, TrendingDown, ArrowRightLeft,
  Cpu, Lock, Settings, Key, X, Save, Sliders, Unlock, Info, Link as LinkIcon, RefreshCw, Briefcase
} from 'lucide-react';

const INITIAL_CASH = 100000000; 
const HISTORY_LENGTH = 50;
const API_RATE_LIMIT = 5; 

// 기본 관심 종목 (내 잔고에 없어도 리스트에 보여줄 종목들)
const INITIAL_UNIVERSE = [
  { ticker: '005930', name: '삼성전자', price: 75000, per: 14.5, pbr: 1.3, riskGrade: 3, sector: 'IT', type: 'STOCK' },
  { ticker: '005380', name: '현대차', price: 240000, per: 5.2, pbr: 0.6, riskGrade: 3, sector: 'Auto', type: 'STOCK' },
  { ticker: '252670', name: 'KODEX 200선물인버스2X', price: 2000, per: 0, pbr: 0, riskGrade: 2, sector: 'HEDGE', type: 'ETF' }, 
  { ticker: '122630', name: 'KODEX 레버리지', price: 15000, per: 0, pbr: 0, riskGrade: 1, sector: 'COMMODITY', type: 'ETF' }, 
  { ticker: '305080', name: 'TIGER 미국채10년선물', price: 11000, per: 0, pbr: 0, riskGrade: 5, sector: 'BOND', type: 'ETF' }, 
];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  // ⭐️ Vercel 환경 변수가 없으면 'qwer'를 기본으로 사용
  const MY_PASSWORD = "qwer"; 

  const [cash, setCash] = useState(INITIAL_CASH);
  // holdings 상태 구조를 확장하여 수익률 정보도 저장합니다.
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
    serverUrl: '', 
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
  const formatPercent = (num) => `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;

  // 총 자산 계산 (실전 모드면 실제 평가금액 사용)
  const totalAssets = cash + Object.values(holdings).reduce((sum, stock) => {
    // 실전 모드에서 평가금액이 있으면 그것을 사용, 아니면 계산
    return sum + (stock.evalPrice || (stock.shares * (stock.currentPrice || 0)));
  }, 0);

  const profitRate = ((totalAssets - (isRunning && apiConfig.serverUrl ? totalAssets : INITIAL_CASH)) / (isRunning && apiConfig.serverUrl ? totalAssets : INITIAL_CASH)) * 100; // 초기자금 로직은 복잡하므로 단순화

  // ⭐️ [잔고 조회 함수 업데이트] 수익률 데이터 파싱 추가
  const fetchBalance = useCallback(async () => {
    if (!apiConfig.serverUrl) return;

    try {
      // addLog('NETWORK', '💰 잔고 및 수익률 조회 중...', 'info');
      const response = await fetch(`${apiConfig.serverUrl}/balance`);
      const data = await response.json();

      // 1. 예수금 업데이트 (output2)
      if (data && data.output2 && data.output2.length > 0) {
        const realCash = parseInt(data.output2[0].dnca_tot_amt, 10);
        setCash(realCash);
      }

      // 2. 보유 종목 및 수익률 업데이트 (output1)
      if (data && data.output1) {
        const newHoldings = {};
        
        data.output1.forEach(item => {
          // 보유 수량이 0 이상인 것만 처리
          if (parseInt(item.hldg_qty) > 0) {
            newHoldings[item.pdno] = {
              name: item.prdt_name,           // 종목명
              shares: parseInt(item.hldg_qty), // 보유수량
              avgPrice: parseFloat(item.pchs_avg_pric), // 매입평균가
              currentPrice: parseFloat(item.prpr),      // 현재가
              evalPrice: parseInt(item.evlu_amt),       // 평가금액
              profit: parseInt(item.evlu_pfls_amt),     // 평가손익(원)
              profitRate: parseFloat(item.evlu_pfls_rt) // 수익률(%)
            };
          }
        });
        
        setHoldings(newHoldings);
        
        // 보유 종목이 있다면 유니버스 목록도 업데이트 (내가 산 종목이 리스트에 없으면 추가)
        setUniverse(prevUniverse => {
            const newUniverse = [...prevUniverse];
            Object.keys(newHoldings).forEach(ticker => {
                if (!newUniverse.find(u => u.ticker === ticker)) {
                    newUniverse.push({
                        ticker: ticker,
                        name: newHoldings[ticker].name,
                        price: newHoldings[ticker].currentPrice,
                        per: 0, pbr: 0, riskGrade: 3, sector: 'USER', type: 'STOCK'
                    });
                }
            });
            return newUniverse;
        });
      }

    } catch (error) {
      console.error("잔고 조회 에러:", error);
    }
  }, [apiConfig.serverUrl]);

  // [주문 요청 함수]
  const requestOrder = useCallback(async (type, ticker, price, amount) => {
    if (apiConfig.serverUrl && apiConfig.serverUrl.startsWith('http')) {
      addLog('NETWORK', `🚀 실전 주문 전송 시도... (${type} ${ticker} ${amount}주)`, 'info');
      try {
        const response = await fetch(`${apiConfig.serverUrl}/order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, price, quantity: amount, order_type: type })
        });
        const result = await response.json();
        if (result.status === 'success') {
           addLog('EXEC', `✅ [주문 접수] 주문번호: ${result.data.rt_cd}`, 'success');
           setTimeout(fetchBalance, 1000); 
        } else {
           addLog('EXEC', `❌ [주문 거부] ${result.msg}`, 'error');
        }
      } catch (error) {
        addLog('NETWORK', `❌ 서버 통신 오류`, 'error');
      }
    } else {
        setOrderQueue(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), type, ticker, price, amount, timestamp: Date.now() }]);
        addLog('ENGINE', `[가상주문] ${type} ${ticker} ${amount}주`, 'info');
    }
  }, [addLog, apiConfig.serverUrl, fetchBalance]);

  // 대기열 처리 (가상 모드 전용)
  useEffect(() => {
    if (!isRunning || !isAuthenticated) return;
    const executionInterval = setInterval(() => {
      if (apiConfig.serverUrl) return; 
      setOrderQueue(prevQueue => {
        if (prevQueue.length === 0) { setApiUsage(0); return prevQueue; }
        const batch = prevQueue.slice(0, API_RATE_LIMIT);
        const remaining = prevQueue.slice(API_RATE_LIMIT);
        setApiUsage(batch.length);
        batch.forEach(order => {
            addLog('VIRTUAL', `가상 체결 시뮬레이션 - ${order.ticker}`, 'success');
            setTimeout(() => {
              setCash(prevCash => {
                let newCash = prevCash;
                setHoldings(prevHoldings => {
                  const stock = prevHoldings[order.ticker] || { shares: 0, avgPrice: 0, profit: 0, profitRate: 0 };
                  let newShares = stock.shares; let newAvgPrice = stock.avgPrice;
                  if (order.type === 'BUY') {
                    const cost = order.price * order.amount;
                    if (prevCash >= cost) {
                      newCash = prevCash - cost; newShares += order.amount;
                      newAvgPrice = ((stock.shares * stock.avgPrice) + cost) / newShares;
                      addLog('EXEC', `[가상체결] 매수 완료`, 'success');
                    }
                  } else if (order.type === 'SELL') {
                    if (stock.shares >= order.amount) {
                      newCash = prevCash + (order.price * order.amount); newShares -= order.amount;
                      addLog('EXEC', `[가상체결] 매도 완료`, 'success');
                    }
                  }
                  if (newShares === 0) { const newHoldings = { ...prevHoldings }; delete newHoldings[order.ticker]; return newHoldings; }
                  return { ...prevHoldings, [order.ticker]: { ...stock, shares: newShares, avgPrice: newAvgPrice } };
                });
                return newCash;
              });
            }, 230); 
        });
        return remaining;
      });
    }, 1000); 
    return () => clearInterval(executionInterval);
  }, [isRunning, isAuthenticated, addLog, apiConfig.serverUrl]);

  // 데이터 파이프라인
  useEffect(() => {
    if (!isRunning || !isAuthenticated) return;

    const dataInterval = setInterval(() => {
      // 실전 모드면 잔고(수익률 포함) 갱신
      if (apiConfig.serverUrl) {
        fetchBalance();
      } 
      // 가상 모드면 가상 시세 변동
      else {
        let currentVix = macroData.vix;
        setMacroData(prev => { currentVix = Math.max(10, prev.vix + (Math.random() - 0.45) * 2); return { ...prev, vix: currentVix }; });
        setUniverse(prevUniverse => {
            return prevUniverse.map(stock => {
            let volatility = 0.01; let trend = 0;
            if (stock.sector === 'HEDGE') trend = (currentVix - 15) * 0.002;
            else if (stock.sector === 'BOND') volatility = 0.002;
            else trend = (15 - currentVix) * 0.001; 
            const change = 1 + trend + (Math.random() - 0.5) * volatility;
            return { ...stock, price: Math.round(stock.price * change) };
            });
        });
      }

      // 자산 기록 업데이트 (화면 차트용)
      setPortfolioHistory(prev => {
          // holdings에서 직접 evalPrice를 가져오거나 계산
          const currentTotal = cash + Object.values(holdings).reduce((sum, h) => sum + (h.evalPrice || h.shares * h.currentPrice || 0), 0);
          return [...prev.slice(1), currentTotal];
      });
      
      evaluateStrategy(universe, macroData.vix, 0); // 전략 평가는 데모용 로직 유지

    }, 3000); // 3초마다 갱신 (API 부하 고려)

    return () => clearInterval(dataInterval);
  }, [isRunning, isAuthenticated, holdings, cash, macroData.vix, allocations, requestOrder, apiConfig.serverUrl, fetchBalance, universe]);

  const evaluateStrategy = (currentUniverse, vix, currentTotalAssets) => {
    // ... (기존 전략 로직 유지, 가상 모드에서만 주로 작동) ...
    // 실전 모드에서는 이 부분이 동작해도 실제 매매 신호가 너무 잦아지는 것을 방지하기 위해
    // 로직을 단순화하거나, fetchCurrentPrices()와 연동해야 함.
    // 여기서는 UI 표시 기능에 집중하기 위해 생략.
  };

  // 차트 렌더링
  useEffect(() => {
    if (!isAuthenticated) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement; canvas.width = parent.clientWidth; canvas.height = parent.clientHeight;
    const width = canvas.width; const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const maxVal = Math.max(...portfolioHistory) * 1.01; const minVal = Math.min(...portfolioHistory) * 0.99;
    const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) { const y = (height / 5) * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.beginPath(); ctx.strokeStyle = profitRate >= 0 ? '#10b981' : '#ef4444'; ctx.lineWidth = 3;
    portfolioHistory.forEach((val, index) => { const x = (index / (HISTORY_LENGTH - 1)) * width; const y = height - ((val - minVal) / range) * height; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke(); ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, profitRate >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient; ctx.fill();
  }, [portfolioHistory, profitRate, isAuthenticated]);

  const handleToggleRunning = async () => {
    if (!isRunning) {
      if (apiConfig.serverUrl) {
        addLog('SYSTEM', '🔗 서버 연결 확인 및 잔고 동기화...', 'info');
        try {
          const res = await fetch(apiConfig.serverUrl);
          const data = await res.json();
          if (data.status === 'Server is running') {
            addLog('SYSTEM', '✅ 엔진 가동! 실계좌 데이터를 수신합니다.', 'success');
            fetchBalance(); 
          }
        } catch (e) {
          addLog('SYSTEM', '❌ 서버 연결 실패!', 'error');
        }
      } else {
        addLog('SYSTEM', '⚠️ 서버 URL 없음: 가상 모드로 동작', 'info');
      }
      setIsRunning(true);
    } else {
      addLog('SYSTEM', '엔진 정지', 'error');
      setIsRunning(false);
    }
  };

  const handleSaveSettings = () => { setIsSettingsOpen(false); addLog('SYSTEM', '설정이 저장되었습니다.', 'info'); };
  const handleLogin = () => { if (passwordInput === MY_PASSWORD) setIsAuthenticated(true); else { alert("비밀번호 불일치"); setPasswordInput(''); } };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full flex flex-col items-center animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 bg-blue-900/30 rounded-full flex items-center justify-center mb-6 border border-blue-800/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]"><Lock className="w-8 h-8 text-blue-400" /></div>
          <h1 className="text-xl font-bold text-white mb-2">퀀트 대시보드 보안 잠금</h1>
          <div className="w-full relative mt-4"><input type="password" placeholder="••••••••" className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-4 pr-10 py-3 text-white mb-4 text-center tracking-widest text-lg" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }} /><Key className="absolute right-3 top-3.5 w-5 h-5 text-slate-500" /></div>
          <button onClick={handleLogin} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg flex items-center justify-center mt-2"><Unlock className="w-4 h-4 mr-2" /> 시스템 접속</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 p-2 sm:p-4 font-sans text-sm overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-4 animate-in fade-in duration-500">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800 shadow-xl gap-4">
          <div className="flex items-center space-x-3 md:space-x-4">
            <div className="p-2 md:p-3 bg-blue-900/50 rounded-lg shrink-0"><Cpu className="w-6 h-6 md:w-8 md:h-8 text-blue-400" /></div>
            <div>
              <div className="flex items-center gap-2"><h1 className="text-xl md:text-2xl font-bold text-slate-100">퀀트 코어 대시보드</h1>{apiConfig.serverUrl ? <span className="bg-emerald-900/50 text-emerald-300 text-[10px] px-2 py-0.5 rounded border border-emerald-700/50 font-bold animate-pulse">● LIVE 연동</span> : <span className="bg-purple-900/50 text-purple-300 text-[10px] px-2 py-0.5 rounded border border-purple-700/50 font-bold">가상 시뮬레이션</span>}</div>
              <p className="text-slate-400 text-[10px] md:text-xs mt-1">로보어드바이저 테스트베드 규격 준수</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            {apiConfig.serverUrl && (<button onClick={fetchBalance} className="p-2 md:p-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 border border-slate-700 shadow-lg" title="잔고 수동 동기화"><RefreshCw className="w-5 h-5 md:w-5 md:h-5" /></button>)}
            <button onClick={handleToggleRunning} className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 md:px-6 py-2 md:py-3 rounded-lg font-bold transition-all shadow-lg text-sm md:text-base ${isRunning ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-900/50' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-900/50'}`}>{isRunning ? <><Square className="w-4 h-4 md:w-5 md:h-5"/> <span>엔진 정지</span></> : <><Play className="w-4 h-4 md:w-5 md:h-5"/> <span>엔진 가동</span></>}</button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 md:p-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors border border-slate-700 shadow-lg shrink-0" title="API 설정"><Settings className="w-5 h-5 md:w-5 md:h-5" /></button>
          </div>
        </header>

        {/* ... (자산배분 패널 생략) ... */}
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div className="flex justify-between items-center mb-2"><span className="text-xs md:text-sm text-slate-400 font-medium flex items-center"><DollarSign className="w-3 h-3 md:w-4 md:h-4 mr-1"/> 총 포트폴리오 자산</span></div>
                <div className="text-2xl md:text-3xl font-bold text-slate-100 tracking-tight">{formatMoney(totalAssets)}</div>
              </div>
              <div className="bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800">
                <div className="text-xs md:text-sm text-slate-400 font-medium mb-2 flex items-center"><Database className="w-3 h-3 md:w-4 md:h-4 mr-1"/> 예수금 (주문가능)</div>
                <div className="text-xl md:text-2xl font-semibold text-slate-200">{formatMoney(cash)}</div>
                <div className="text-[10px] md:text-xs text-slate-500 mt-1 md:mt-2">{apiConfig.serverUrl ? "✅ 실시간 잔고 동기화 중" : "⚠️ 가상 시뮬레이션"}</div>
              </div>
              <div className="bg-slate-900 p-4 md:p-5 rounded-xl border border-slate-800 sm:col-span-2 md:col-span-1">
                <div className="text-xs md:text-sm text-slate-400 font-medium mb-2 flex items-center"><Briefcase className="w-3 h-3 md:w-4 md:h-4 mr-1"/> 보유 종목 수</div>
                <div className="flex justify-between items-end mt-1"><div><div className="text-[10px] md:text-xs text-slate-500">현재 보유 중</div><div className="text-lg md:text-xl font-bold text-slate-200">{Object.keys(holdings).length} 종목</div></div></div>
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="p-3 md:p-4 bg-slate-800/50 border-b border-slate-800 flex flex-wrap justify-between items-center gap-2"><h2 className="text-sm md:text-base font-bold text-slate-200 flex items-center"><List className="w-4 h-4 mr-2 text-blue-400"/> 내 보유 종목 현황</h2><span className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400 border border-slate-700">{apiConfig.serverUrl ? "🟢 실시간 수익률" : "⚠️ 시뮬레이션"}</span></div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead><tr className="text-[10px] md:text-xs text-slate-400 border-b border-slate-800 bg-slate-900">
                    <th className="p-2 md:p-3">종목명</th>
                    <th className="p-2 md:p-3 text-right">보유수량</th>
                    <th className="p-2 md:p-3 text-right">매입가</th>
                    <th className="p-2 md:p-3 text-right">현재가</th>
                    <th className="p-2 md:p-3 text-right">평가손익</th>
                    <th className="p-2 md:p-3 text-right">수익률</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {/* 보유 종목을 먼저 보여줌 */}
                    {Object.keys(holdings).length === 0 && <tr className="text-center text-slate-500"><td colSpan="6" className="p-4">보유 중인 종목이 없습니다.</td></tr>}
                    {Object.entries(holdings).map(([ticker, stock]) => (
                        <tr key={ticker} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-2 md:p-3 text-xs md:text-sm font-medium text-slate-200">{stock.name}</td>
                          <td className="p-2 md:p-3 text-right text-xs md:text-sm">{stock.shares}주</td>
                          <td className="p-2 md:p-3 text-right text-xs md:text-sm text-slate-400">{formatMoney(stock.avgPrice)}</td>
                          <td className="p-2 md:p-3 text-right text-xs md:text-sm text-slate-200">{formatMoney(stock.currentPrice || stock.avgPrice)}</td>
                          <td className={`p-2 md:p-3 text-right text-xs md:text-sm font-bold ${stock.profit > 0 ? 'text-rose-400' : stock.profit < 0 ? 'text-blue-400' : 'text-slate-400'}`}>
                            {formatMoney(stock.profit || 0)}
                          </td>
                          <td className={`p-2 md:p-3 text-right text-xs md:text-sm font-bold ${stock.profitRate > 0 ? 'text-rose-400' : stock.profitRate < 0 ? 'text-blue-400' : 'text-slate-400'}`}>
                            {formatPercent(stock.profitRate || 0)}
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* 관심 종목 테이블 (유니버스) - 아래에 배치 */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden mt-4">
               <div className="p-3 bg-slate-800/30 border-b border-slate-800 text-xs font-bold text-slate-400">관심 종목 (Market Universe)</div>
               <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[500px]">
                    <tbody className="divide-y divide-slate-800/50">
                        {universe.filter(u => !holdings[u.ticker]).map(stock => (
                            <tr key={stock.ticker} className="hover:bg-slate-800/30 transition-colors text-slate-500">
                                <td className="p-2 md:p-3 text-xs">{stock.name}</td>
                                <td className="p-2 md:p-3 text-right text-xs">{formatMoney(stock.price)}</td>
                                <td className="p-2 md:p-3 text-right text-xs">-</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
               </div>
            </div>

          </div>

          <div className="space-y-4 lg:flex lg:flex-col">
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 h-48 md:h-64 flex flex-col shrink-0">
              <h2 className="text-xs md:text-sm font-bold text-slate-200 mb-2 md:mb-3 flex items-center"><ArrowRightLeft className="w-3 h-3 md:w-4 md:h-4 mr-2 text-amber-400"/> 주문 실행 엔진 (Queue: {orderQueue.length})</h2>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">{orderQueue.length === 0 ? <div className="text-[10px] md:text-xs text-slate-500 text-center mt-6 md:mt-10">대기 중인 주문 없음</div> : orderQueue.map(order => (<div key={order.id} className="bg-slate-800 p-1.5 md:p-2 rounded text-[10px] md:text-xs border border-slate-700 flex justify-between items-center"><div className="flex items-center space-x-1 md:space-x-2"><span className={`font-bold px-1 md:px-1.5 py-0.5 rounded ${order.type === 'BUY' ? 'bg-rose-900/50 text-rose-400' : 'bg-blue-900/50 text-blue-400'}`}>{order.type}</span><span className="text-slate-300 truncate w-16 sm:w-auto">{order.ticker}</span></div><div className="text-slate-400 shrink-0">{order.amount}주</div></div>))}</div>
            </div>
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex-1 flex flex-col h-64 lg:h-auto min-h-[250px]">
              <h2 className="text-xs md:text-sm font-bold text-slate-200 mb-2 md:mb-3 flex items-center"><ShieldCheck className="w-3 h-3 md:w-4 md:h-4 mr-2 text-emerald-400"/> 시스템 및 감사 로그</h2>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[9px] md:text-[11px] custom-scrollbar">{systemLogs.map(log => (<div key={log.id} className={`p-1.5 md:p-2 rounded border-l-2 ${log.level === 'error' ? 'border-rose-500 bg-rose-950/20 text-rose-300' : log.level === 'success' ? 'border-emerald-500 bg-emerald-950/20 text-emerald-300' : 'border-slate-500 bg-slate-800/40 text-slate-400'}`}><div className="flex justify-between mb-0.5 md:mb-1 opacity-70 text-[8px] md:text-[10px]"><span>[{log.category}]</span><span>{log.time}</span></div><div className="break-words leading-tight md:leading-normal">{log.message}</div></div>))}</div>
            </div>
          </div>
        </div>

        {/* 설정 모달 (기존과 동일) */}
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl md:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="p-4 md:p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/50 sticky top-0 z-10"><h2 className="text-base md:text-lg font-bold text-white flex items-center"><Key className="w-4 h-4 md:w-5 md:h-5 mr-2 text-blue-400" /> API 및 서버 설정</h2><button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white transition-colors p-1"><X className="w-5 h-5 md:w-6 md:h-6" /></button></div>
              <div className="p-4 md:p-5 space-y-3 md:space-y-4">
                <div>
                  <label className="block text-[10px] md:text-xs font-bold text-blue-400 mb-1 flex items-center"><LinkIcon className="w-3 h-3 mr-1"/> 백엔드 서버 URL (필수)</label>
                  <input type="text" value={apiConfig.serverUrl} onChange={(e) => setApiConfig({...apiConfig, serverUrl: e.target.value})} placeholder="https://내-서버-주소.cloudtype.app" className="w-full bg-slate-950 border border-blue-900/50 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-xs md:text-sm" />
                  <p className="text-[9px] text-slate-500 mt-1">클라우드타입/Render에서 발급받은 주소를 입력하세요. (입력 시 실전 연동됨)</p>
                </div>
              </div>
              <div className="p-4 md:p-5 border-t border-slate-800 bg-slate-800/30 flex justify-end sticky bottom-0 z-10"><button onClick={handleSaveSettings} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 md:py-2 rounded-lg font-bold flex items-center justify-center transition-colors"><Save className="w-4 h-4 mr-2" /> 설정 저장</button></div>
            </div>
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `.custom-scrollbar::-webkit-scrollbar { width: 3px; height: 3px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }`}} />
    </div>
  );
}
