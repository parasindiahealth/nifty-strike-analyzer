// app.js - main application logic
(async function(){
  // util parse CSV
  function parseCSV(text) {
    const rows = text.trim().split(/\r?\n/).map(r=>r.trim()).filter(Boolean);
    const headers = rows[0].split(',').map(h=>h.trim().toLowerCase());
    const out = [];
    for(let i=1;i<rows.length;i++){ const cols = rows[i].split(','); const obj = {}; headers.forEach((h,idx)=>obj[h]=cols[idx]); out.push(obj); }
    return out;
  }

  // indicators
  function SMA(values, period){ const res=[]; let sum=0; for(let i=0;i<values.length;i++){ sum+=values[i]; if(i>=period) sum-=values[i-period]; res[i]= i>=period-1 ? sum/period : null; } return res; }
  function bollinger(values, period=22, mult=2){ const ma = SMA(values,period); const out=[]; for(let i=0;i<values.length;i++){ if(i<period-1){ out.push({upper:null,lower:null,middle:null}); continue;} let sumsq=0; for(let j=i-period+1;j<=i;j++){ const d=values[j]-ma[i]; sumsq+=d*d; } const sd=Math.sqrt(sumsq/period); out.push({upper:ma[i]+mult*sd, middle:ma[i], lower:ma[i]-mult*sd}); } return out; }
  function ADX(highs,lows,closes,period=14){ const len=highs.length; const tr=new Array(len).fill(null); const plusDM=new Array(len).fill(0); const minusDM=new Array(len).fill(0);
    for(let i=1;i<len;i++){ const up=highs[i]-highs[i-1]; const down=lows[i-1]-lows[i]; plusDM[i]=(up>down && up>0)?up:0; minusDM[i]=(down>up && down>0)?down:0; const range1=highs[i]-lows[i]; const range2=Math.abs(highs[i]-closes[i-1]); const range3=Math.abs(lows[i]-closes[i-1]); tr[i]=Math.max(range1,range2,range3); }
    const atr=new Array(len).fill(null), smPlus=new Array(len).fill(null), smMinus=new Array(len).fill(null);
    let atrSum=0,pSum=0,mSum=0; for(let i=1;i<len;i++){ if(i<=period){ atrSum += tr[i]||0; pSum+=plusDM[i]||0; mSum+=minusDM[i]||0; if(i===period){ atr[i]=atrSum/period; smPlus[i]=pSum/period; smMinus[i]=mSum/period; } } else { atr[i]=((atr[i-1]*(period-1))+tr[i])/period; smPlus[i]=((smPlus[i-1]*(period-1))+plusDM[i])/period; smMinus[i]=((smMinus[i-1]*(period-1))+minusDM[i])/period; } }
    const plusDI=new Array(len).fill(null), minusDI=new Array(len).fill(null), dx=new Array(len).fill(null), adx=new Array(len).fill(null);
    for(let i=0;i<len;i++){ if(atr[i] && atr[i] !== 0){ plusDI[i]=100*(smPlus[i]/atr[i]); minusDI[i]=100*(smMinus[i]/atr[i]); dx[i] = 100*(Math.abs(plusDI[i]-minusDI[i])/(plusDI[i]+minusDI[i])); } }
    let dxSum=0; for(let i=0;i<len;i++){ if(i<period*2){ if(dx[i]) dxSum+=dx[i]; if(i===period*2-1) adx[i]=dxSum/period; } else { adx[i]=((adx[i-1]*(period-1))+dx[i])/period; } }
    return {adx,plusDI,minusDI};
  }

  // chart init
  const chart = LightweightCharts.createChart(document.getElementById('chart'), { width: '100%', height: 420, layout: { backgroundColor: '#071029', textColor: '#dbeafe' }, rightPriceScale: { visible: true } });
  const candleSeries = chart.addCandlestickSeries();
  const maSeries = chart.addLineSeries({ color: '#f97316' });
  const upperSeries = chart.addLineSeries({ color: '#60a5fa', lineStyle: 1 });
  const lowerSeries = chart.addLineSeries({ color: '#60a5fa', lineStyle: 1 });

  let ohlc = [];

  // load CSV
  document.getElementById('loadBtn').addEventListener('click', async ()=>{
    const f = document.getElementById('fileInput').files[0];
    if(!f) return alert('Upload CSV');
    const txt = await f.text();
    const rows = parseCSV(txt);
    // normalize
    const data = rows.map(r=>({ time: (new Date(r.date)).toISOString().split('T')[0], open: parseFloat(r.open), high: parseFloat(r.high), low: parseFloat(r.low), close: parseFloat(r.close), volume: parseFloat(r.volume||0) })).filter(x=>!isNaN(x.close));
    ohlc = data;
    candleSeries.setData(data);
    const closes = data.map(d=>d.close);
    const highs = data.map(d=>d.high);
    const lows = data.map(d=>d.low);
    const ma22 = SMA(closes,22);
    const bb = bollinger(closes,22,2);
    const adxObj = ADX(highs,lows,closes,14);
    // plot MA
    const maPoints = ma22.map((v,i)=> v ? { time: data[i].time, value: v } : null).filter(Boolean);
    maSeries.setData(maPoints);
    // plot BB
    upperSeries.setData(bb.map((b,i)=> b.upper ? {time:data[i].time, value:b.upper} : null).filter(Boolean));
    lowerSeries.setData(bb.map((b,i)=> b.lower ? {time:data[i].time, value:b.lower} : null).filter(Boolean));
    // compute signals
    const signals = closes.map((p,i)=>{ const m=ma22[i]; const b=bb[i]; const adxVal=adxObj.adx[i]; if(m && adxVal && p>m && adxVal>20 && p> (b?b.middle: -Infinity)) return 'BUY'; if(m && adxVal && p<m && adxVal>20 && p<(b?b.middle: Infinity)) return 'SELL'; return 'HOLD'; });
    const latest = signals[signals.length-1] || 'HOLD';
    document.getElementById('latestSignal').innerText = latest;
    document.getElementById('diag').innerText = JSON.stringify({rows: data.length, lastClose: closes[closes.length-1], latestSignal: latest}, null, 2);
  });

  // TF.js model: small dense model using sliding windows
  let model = null;
  document.getElementById('trainBtn').addEventListener('click', async ()=>{
    if(!ohlc || ohlc.length<100) return alert('Load >=100 rows for training');
    const closes = ohlc.map(d=>d.close);
    const WINDOW = 20;
    const X = [], Y = [];
    for(let i=0;i<closes.length-WINDOW;i++){ X.push(closes.slice(i,i+WINDOW)); Y.push([closes[i+WINDOW]]); }
    // normalize by last value in window
    const Xn = X.map(win => win.map(v=>v/win[win.length-1] - 1));
    const xs = tf.tensor2d(Xn);
    const ys = tf.tensor2d(Y);
    model = tf.sequential();
    model.add(tf.layers.dense({units:64, activation:'relu', inputShape:[WINDOW]}));
    model.add(tf.layers.dropout({rate:0.1}));
    model.add(tf.layers.dense({units:32, activation:'relu'}));
    model.add(tf.layers.dense({units:1}));
    model.compile({optimizer:tf.train.adam(0.001), loss:'meanAbsoluteError'});
    await model.fit(xs, ys, {epochs:20, batchSize:32, callbacks: { onEpochEnd: (e,l)=> console.log('epoch', e, l) } });
    alert('Model trained (basic). Click Predict Next.');
  });

  document.getElementById('predictBtn').addEventListener('click', async ()=>{
    if(!model) return alert('Train model first');
    const closes = ohlc.map(d=>d.close);
    const WINDOW = 20;
    const lastWindow = closes.slice(closes.length-WINDOW);
    const norm = lastWindow.map(v=> v/lastWindow[lastWindow.length-1] - 1);
    const pred = model.predict(tf.tensor2d([norm]));
    const pval = (await pred.data())[0];
    const estimated = (pval + 1) * lastWindow[lastWindow.length-1];
    alert('Predicted next close: ' + estimated.toFixed(2));
  });

  // Option Chain wiring (uses OC module)
  const ocContainer = document.getElementById('ocContainer');
  document.getElementById('ocFetchBtn').addEventListener('click', async ()=>{
    try{
      const symbol = document.getElementById('symbolSel').value || 'NIFTY';
      const json = await OC.fetchOptionChain(symbol);
      const exps = json.records && json.records.expiryDates || [];
      const sel = document.getElementById('ocExpiry'); sel.innerHTML = '';
      exps.forEach(e => sel.appendChild(new Option(e,e)));
      const expiry = sel.value;
      OC.renderOptionChain(json, ocContainer, expiry);
      document.getElementById('ocInfo').innerText = 'Underlying: ' + (json.records.underlyingValue || '-') + ' · Strikes: ' + (json.records.data.length || 0);
      if(document.getElementById('ocRefresh').value > 0){ const t = parseInt(document.getElementById('ocRefresh').value,10); setInterval(()=> document.getElementById('ocFetchBtn').click(), t*1000); }
    }catch(err){ console.error(err); document.getElementById('ocInfo').innerText = 'OC fetch failed: ' + err.message; }
  });

  // README quick show
  document.getElementById('showReadme').addEventListener('click', ()=>{ alert('Open README.md in project root for deploy steps (Cloudflare Worker + GitHub Pages)'); });

  // Export signals CSV stub
  document.getElementById('exportBtn').addEventListener('click', ()=>{ alert('Export feature: use generated signals array to CSV (not yet implemented in UI)'); });

})();