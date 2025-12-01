// assets/js/ocWidget.js
// Option Chain widget with proxy support and simple renderer.
// Remember to set PROXY_URL to your deployed worker URL before using live OC fetch.
const OC = (function(){
 let PROXY_URL = "https://soft-snow-bf47.paras-indiahealth.workers.dev/?url="; // <--- replace after worker deploy

  function setProxy(url) { PROXY_URL = url; }

  function nseUrl(symbol){
    return 'https://www.nseindia.com/api/option-chain-indices?symbol=' + encodeURIComponent(symbol);
  }

  async function fetchOptionChain(symbol){
    const target = nseUrl(symbol);
    const resp = await fetch(PROXY_URL + encodeURIComponent(target));
    if(!resp.ok) throw new Error('Proxy fetch failed: ' + resp.status);
    const json = await resp.json();
    window.latestOcJson = json;
    return json;
  }

  function renderOptionChain(json, container, expiry){
    container.innerHTML = '';
    if(!json || !json.records){ container.innerText = 'No data'; return; }
    const underlying = json.records.underlyingValue;
    const rows = json.records.data.filter(r => !expiry || r.expiryDate === expiry);
    const strikes = {};
    rows.forEach(r => { strikes[r.strikePrice] = r; });
    const strikeKeys = Object.keys(strikes).map(s=>parseFloat(s)).sort((a,b)=>b-a);
    const table = document.createElement('table'); table.className = 'w-full text-sm';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr class='text-xs text-slate-300'><th>CE OI</th><th>CE ΔOI</th><th>CE LTP</th><th class='text-center'>Strike</th><th>PE LTP</th><th>PE ΔOI</th><th>PE OI</th></tr>`;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    const atm = strikeKeys.reduce((p,c)=> Math.abs(c-underlying) < Math.abs(p-underlying) ? c : p );
    strikeKeys.forEach(strike=>{
      const r = strikes[strike];
      const ce = r.CE||{};
      const pe = r.PE||{};
      const tr = document.createElement('tr');
      tr.className = 'odd:bg-slate-900/30 even:bg-slate-900/10';
      if(strike === atm) tr.style.background = 'linear-gradient(90deg, rgba(34,197,94,0.06), rgba(59,130,246,0.04))';
      tr.innerHTML = `<td>${ce.openInterest||''}</td><td>${ce.changeinOpenInterest||''}</td><td>${ce.lastPrice||''}</td><td class='text-center font-medium'>${strike}</td><td>${pe.lastPrice||''}</td><td>${pe.changeinOpenInterest||''}</td><td>${pe.openInterest||''}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  return { setProxy, fetchOptionChain, renderOptionChain };
})();
