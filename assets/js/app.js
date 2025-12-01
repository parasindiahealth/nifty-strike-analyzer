// assets/js/app.js
// Main app logic: CSV parsing, indicators, charting, TF.js model, news sentiment, FII/DII parser.
(async function(){
  // ---- Utilities ----
  function parseCSV(text){
    const rows = text.trim().split(/\r?\n/).map(r=>r.trim()).filter(Boolean);
    if(rows.length===0) return [];
    const headers = rows[0].split(',').map(h=>h.trim().toLowerCase());
    const out = [];
    for(let i=1;i<rows.length;i++){
      const cols = rows[i].split(',');
      const obj = {};
      headers.forEach((h,idx)=> obj[h]=cols[idx]!==undefined ? cols[idx].trim() : '');
      out.push(obj);
    }
    return out;
  }

  // ---- Indicators ----
  function SMA(values, period){
    const res = []; let sum=0;
    for(let i=0;i<values.length;i++){
      const v = values[i];
      sum += v;
      if(i>=period) sum -= values[i-period];
      res[i] = i>=period-1 ? sum/period : null;
    }
    return res;
  }

  function bollinger(values, period=22, mult=2){
    const ma = SMA(values, period);
    const out = [];
    for(let i=0;i<values.length;i++){
      if(i < period-1){ out.push({upper:null, lower:null, middle:null}); continue; }
      let sumsq = 0;
      for(let j=i-period+1;j<=i;j++){ const d = values[j] - ma[i]; sumsq += d*d; }
      const sd = Math.sqrt(sumsq/period);
      out.push({ upper: ma[i] + mult*sd, middle: ma[i], lower: ma[i] - mult*sd });
    }
    return out;
  }

  function RSI(values, period=14){
    const out = []; let gain=0, loss=0;
    for(let i=1;i<values.length;i++){
      const delta = values[i] - values[i-1];
      gain += delta>0 ? delta : 0;
      loss += delta<0 ? -delta : 0;
      if(i < period) { out[i]=null; continue; }
      if(i===period){
        let g=0,l=0;
        for(let j=1;j<=period;j++){ const d = values[j]-values[j-1]; if(d>0) g+=d; else l+=-d; }
        gain = g/period; loss = l/period;
      } else {
        const d = values[i] - values[i-1];
        gain = (gain*(period-1) + (d>0?d:0))/period;
        loss = (loss*(period-1) + (d<0?-d:0))/period;
      }
      const rs = loss===0 ? 100 : gain/loss;
      out[i] = 100 - (100/(1+rs));
    }
    return out;
  }

  function ADX(highs,lows,closes,period=14){
    const len = highs.length;
    const tr = new Array(len).fill(null);
    const plusDM = new Array(len).fill(0), minusDM = new Array(len).fill(0);
    for(let i=1;i<len;i++){
      const up = highs[i] - highs[i-1];
      const down = lows[i-1] - lows[i];
      plusDM[i] = (up > down && up>0) ? up : 0;
      minusDM[i] = (down > up && down>0) ? down : 0;
      const range1 = highs[i] - lows[i];
      const range2 = Math.abs(highs[i] - closes[i-1]);
      const range3 = Math.abs(lows[i] - closes[i-1]);
      tr[i] = Math.max(range1, range2, range3);
    }
    const atr = new Array(len).fill(null), smPlus=new Array(len).fill(null), smMinus=new Array(len).fill(null);
    let atrSum=0, pSum=0, mSum=0;
    for(let i=1;i<len;i++){
      if(i<=period){ atrSum += tr[i]||0; pSum += plusDM[i]||0; mSum += minusDM[i]||0; if(i===period){ atr[i]=atrSum/period; smPlus[i]=pSum/period; smMinus[i]=mSum/period; } }
      else { atr[i] = ((atr[i-1]*(period-1))+tr[i])/period; smPlus[i]=((smPlus[i-1]*(period-1))+plusDM[i])/period; smMinus[i]=((smMinus[i-1]*(period-1))+minusDM[i])/period; }
    }
    const plusDI=new Array(len).fill(null), minusDI=new Array(len).fill(null), dx=new Array(len).fill(null), adx=new Array(len).fill(null);
    for(let i=0;i<len;i++){
      if(atr[i] && atr[i] !== 0){ plusDI[i] = 100*(smPlus[i]/atr[i]); minusDI[i] = 100*(smMinus[i]/atr[i]); dx[i] = 100*(Math.abs(plusDI[i]-minusDI[i])/(plusDI[i]+minusDI[i])); }
    }
    for(let i=0;i<len;i++){
      if(i < period*2){ if(dx[i]){ /* accumulate */ } if(i===period*2-1) { let s=0; for(let j=period;j<=period*2-1;j++) s+=dx[j]; adx[i]=s/period; } }
      else { adx[i] = ((adx[i-1]*(period-1))+dx[i])/period; }
    }
    return { adx, plusDI, minusDI };
  }

  // ---- Chart ----
  const chart = LightweightCharts.createChart(document.getElementById('chart'), {
    width: document.getElementById('chart').clientWidth,
    height: 460,
    layout: { backgroundColor: '#071029', textColor: '#dbeafe' },
    grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } }
  });
  const candleSeries = chart.addCandlestickSeries();
  const maSeries = chart.addLineSeries({ color: '#f97316' });
  const upperSeries = chart.addLineSeries({ color: '#60a5fa' });
  const lowerSeries = chart.addLineSeries({ color: '#60a5fa' });

  window.addEventListener('resize', ()=> chart.resize(document.getElementById('chart').clientWidth, 460));

  // state
  let ohlc = [];
  let signals = [];

  // ---- Load CSV and analyze ----
  document.getElementById('loadBtn').addEventListener('click', async ()=>{
    const f = document.getElementById('fileInput').files[0];
    if(!f) return alert('Upload CSV (date,open,high,low,close,volume)');
    const txt = await f.text();
    const rows = parseCSV(txt);
    const data = rows.map(r=>{
      const date = r.date || r.datetime || r.time;
      const iso = new Date(date).toISOString().split('T')[0];
      return { time: iso, open: parseFloat(r.open), high: parseFloat(r.high), low: parseFloat(r.low), close: parseFloat(r.close), volume: parseFloat(r.volume||0) };
    }).filter(x=>!isNaN(x.close));
    if(data.length === 0) return alert('No valid rows parsed.');
    ohlc = data;
    candleSeries.setData(data);
    const closes = data.map(d=>d.close);
    const highs = data.map(d=>d.high);
    const lows = data.map(d=>d.low);

    // indicators
    const ma22 = SMA(closes,22);
    const bb = bollinger(closes,22,2);
    const adxObj = ADX(highs,lows,closes,14);
    const rsi = RSI(closes,14);

    // draw MA & BB
    const maPoints = ma22.map((v,i)=> v ? { time: data[i].time, value: v } : null).filter(Boolean);
    maSeries.setData(maPoints);
    upperSeries.setData(bb.map((b,i)=> b.upper ? { time: data[i].time, value: b.upper } : null).filter(Boolean));
    lowerSeries.setData(bb.map((b,i)=> b.lower ? { time: data[i].time, value: b.lower } : null).filter(Boolean));

    // signals
    signals = closes.map((p,i)=>{
      const m = ma22[i];
      const b = bb[i];
      const adxVal = adxObj.adx[i];
      if(m && adxVal && b && p > m && adxVal > 20 && p > b.middle) return 'BUY';
      if(m && adxVal && b && p < m && adxVal > 20 && p < b.middle) return 'SELL';
      return 'HOLD';
    });
    const latest = signals[signals.length-1] || 'HOLD';
    document.getElementById('latestSignal').innerText = latest;
    document.getElementById('diag').innerText = JSON.stringify({
      rows: data.length,
      lastDate: data[data.length-1].time,
      lastClose: closes[closes.length-1],
      latestSignal: latest
    }, null, 2);
  });

  // ---- TF.js model (dense window) ----
  let model = null;
  document.getElementById('trainBtn').addEventListener('click', async ()=>{
    if(!ohlc || ohlc.length < 120) return alert('Load at least 120 rows for training.');
    const closes = ohlc.map(d=>d.close);
    const WINDOW = 20;
    const X = [], Y = [];
    for(let i=0;i<closes.length-WINDOW;i++){
      X.push(closes.slice(i,i+WINDOW));
      Y.push(closes[i+WINDOW]);
    }
    // normalize each window by its last value
    const Xn = X.map(win => win.map(v=> v / win[win.length-1] - 1));
    const Yn = Y.map((y,i)=> y); // using raw target
    const xs = tf.tensor2d(Xn);
    const ys = tf.tensor2d(Yn, [Yn.length,1]);
    model = tf.sequential();
    model.add(tf.layers.dense({ units:128, activation:'relu', inputShape:[WINDOW] }));
    model.add(tf.layers.dropout({ rate:0.1 }));
    model.add(tf.layers.dense({ units:64, activation:'relu' }));
    model.add(tf.layers.dense({ units:1 }));
    model.compile({ optimizer: tf.train.adam(0.001), loss:'meanAbsoluteError' });
    await model.fit(xs, ys, { epochs:25, batchSize:32, callbacks: { onEpochEnd: (e, l) => console.log('epoch', e, l) } });
    alert('Model trained (basic). Click Predict Next.');
  });

  document.getElementById('predictBtn').addEventListener('click', async ()=>{
    if(!model) return alert('Train model first.');
    const closes = ohlc.map(d=>d.close);
    const WINDOW = 20;
    const lastWindow = closes.slice(closes.length-WINDOW);
    const norm = lastWindow.map(v=> v / lastWindow[lastWindow.length-1] - 1);
    const pred = model.predict(tf.tensor2d([norm]));
    const pval = (await pred.data())[0];
    // roughly estimate value (model predicted raw value)
    const estimated = pval;
    alert('Predicted next close (approx): ' + estimated.toFixed(2));
  });

  // ---- Option Chain integration ----
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
      // refresh if chosen
      if(document.getElementById('ocRefresh').value > 0){
        const t = parseInt(document.getElementById('ocRefresh').value,10);
        setInterval(()=> document.getElementById('ocFetchBtn').click(), t*1000);
      }
    } catch(err){
      console.error(err);
      document.getElementById('ocInfo').innerText = 'OC fetch failed: ' + err.message;
    }
  });

  // ---- News sentiment (simple) ----
  document.getElementById('newsFetchBtn').addEventListener('click', async ()=>{
    const url = document.getElementById('newsUrl').value.trim() || 'https://news.google.com/rss/search?q=nifty';
    try{
      // use allorigins public proxy for RSS as fallback (may be rate-limited)
      const proxy = 'https://api.allorigins.win/raw?url=';
      const resp = await fetch(proxy + encodeURIComponent(url));
      const txt = await resp.text();
      // extract titles via regex (simple)
      const items = Array.from(txt.matchAll(/<title>(.*?)<\/title>/g)).map(m=>m[1]).slice(1,15);
      // simple sentiment wordlist
      const pos = ['rally','gain','up','surge','beat','strong','rise','positive','optimis'];
      const neg = ['fall','down','drop','weak','loss','decline','negative','concern','fear','sell'];
      let score = 0;
      const details = items.map(t=>{
        const l = t.toLowerCase();
        let s=0;
        pos.forEach(w=>{ if(l.includes(w)) s+=1; });
        neg.forEach(w=>{ if(l.includes(w)) s-=1; });
        score += s;
        return { title: t, score: s };
      });
      const out = document.getElementById('newsOut');
      out.innerHTML = `<div>Aggregate score: ${score}</div>` + details.map(d=>`<div class="mt-1">${d.score>0? '🟢': d.score<0? '🔴':'⚪'} ${d.title}</div>`).join('');
    } catch(err){
      console.error(err);
      document.getElementById('newsOut').innerText = 'News fetch failed: ' + err.message;
    }
  });

  // ---- FII/DII parser (expects CSV uploaded by user) ----
  // For demo: user uploads CSV with headers: date,fii_buy,fii_sell,dii_buy,dii_sell
  // Provide a simple parser if they paste such data into fileInput; not implemented as separate UI here.

  // ---- Quick UI ----
  document.getElementById('showReadme').addEventListener('click', ()=>{ alert('Open README.md in the project root for deploy steps (Cloudflare Worker + GitHub Pages)'); });
  document.getElementById('deployWorkerBtn').addEventListener('click', ()=>{ alert('To fetch NSE option-chain reliably, deploy the included Cloudflare Worker and update assets/js/ocWidget.js PROXY URL. See README.md.'); });
  document.getElementById('exportBtn').addEventListener('click', ()=>{
    if(!signals || signals.length===0) return alert('No signals to export.');
    const rows = [['date','close','signal']];
    for(let i=0;i<ohlc.length;i++) rows.push([ohlc[i].time, ohlc[i].close, signals[i]||'']);
    const csv = rows.map(r=>r.join(',')).join('\\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'signals.csv'; a.click(); URL.revokeObjectURL(url);
  });

})();
