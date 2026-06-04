/* To Block — the priority tab. Progress hero + bulk-select queue. */
function ProgressHero({ run, action, onStop }){
  const pct = run.total ? Math.round((run.processed/run.total)*100) : 0;
  const remaining = run.total - run.processed;
  const eta = Math.max(0, Math.round(remaining * 0.7));
  const verb = action==="block" ? "Blocking" : "Muting";
  const done = action==="block" ? "blocked" : "muted";
  return (
    <div className="hero">
      <div className="hero-top">
        <div>
          <div className="hero-state">
            <span className="nav-dot" style={{position:"static"}}></span>
            {verb} queue is running
          </div>
          <div className="hero-current">
            {run.current ? <Avatar handle={run.current} size="lg" /> : <div className="spinner" />}
            <div>
              <div className="hero-doing">{run.current ? `Now ${done.slice(0,-2)}ing` : "Preparing…"}</div>
              <div className="hero-user">@{run.current || "…"}</div>
            </div>
          </div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat"><div className="n tnum">{run.doneCount}</div><div className="l">{done}</div></div>
          <div className="hero-stat"><div className="n warn tnum">{run.notFoundCount}</div><div className="l">not found</div></div>
          <div className="hero-stat"><div className="n tnum">{remaining}</div><div className="l">remaining</div></div>
        </div>
      </div>
      <div className="progress"><div className="progress-fill" style={{ width: pct+"%" }} /></div>
      <div className="hero-foot">
        <div className="hero-meta">{run.processed} / {run.total} processed · {pct}% · ~{eta}s left</div>
        <Btn variant="danger" icon="stop" onClick={onStop}>Stop run</Btn>
      </div>
    </div>
  );
}

function QueueRow({ item, action, selected, onToggleSel, onAct, onRemove, processing }){
  const verb = action==="block" ? "Block" : "Mute";
  return (
    <div className={"row"+(selected?" sel":"")+(item.notFound?" gone":"")+(processing?" processing":"")}>
      <Check on={selected} onClick={onToggleSel} />
      <Avatar handle={item.handle} size="sm" />
      <div className="row-main">
        <div className="row-handle">
          <a className="h" href={"https://x.com/"+item.handle} target="_blank" rel="noopener">@{item.handle}</a>
          {processing && <span className="spinner" style={{width:15,height:15,borderWidth:2}} />}
        </div>
      </div>
      {item.notFound && <Tag kind="warn" icon="alert">not found</Tag>}
      <div className="row-actions">
        <Btn size="sm" variant="ghost" onClick={onAct}>{verb}</Btn>
        <button className="btn-icon" title="Remove from queue" onClick={onRemove}><Icon name="x" size={16} /></button>
      </div>
    </div>
  );
}

function ToBlock({ queue, action, setAction, run, onStart, onStop, onClear, onImport, onRemove, onActOne }){
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const [sel, setSel] = React.useState(()=>new Set());
  const fileRef = React.useRef();

  const running = run.active;
  const counts = React.useMemo(()=>({
    all: queue.length,
    pending: queue.filter(i=>!i.notFound).length,
    notfound: queue.filter(i=>i.notFound).length,
  }),[queue]);

  const shown = queue.filter(i => {
    if (filter==="pending" && i.notFound) return false;
    if (filter==="notfound" && !i.notFound) return false;
    if (q && !i.handle.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const shownIds = shown.map(i=>i.id);
  const allSelShown = shownIds.length>0 && shownIds.every(id=>sel.has(id));

  const toggleSel = id => setSel(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleAll = () => setSel(prev => {
    if (allSelShown){ const n=new Set(prev); shownIds.forEach(id=>n.delete(id)); return n; }
    return new Set([...prev, ...shownIds]);
  });
  const clearSel = () => setSel(new Set());

  const verb = action==="block" ? "Block" : "Mute";
  const verbing = action==="block" ? "Blocking" : "Muting";

  // empty queue entirely
  if (queue.length===0){
    return (
      <div className="page fade-in">
        <Header/>
        <input ref={fileRef} type="file" accept=".json,.csv" hidden onChange={e=>{ onImport(); e.target.value=""; }} />
        <div className="dropzone" onClick={()=>fileRef.current.click()}>
          <div className="dz-ico"><Icon name="upload" size={24} /></div>
          <div className="empty-title">Import a list to get started</div>
          <div className="empty-sub" style={{margin:"7px auto 0"}}>Drop a <span className="mono">.json</span> backup export or <span className="mono">.csv</span> of handles. We'll de-dupe against accounts you've already blocked.</div>
          <div className="mt18"><Btn variant="primary" icon="upload">Choose file</Btn></div>
        </div>
      </div>
    );
  }

  return (
    <div className="page fade-in">
      <Header/>
      <input ref={fileRef} type="file" accept=".json,.csv" hidden onChange={e=>{ onImport(); e.target.value=""; }} />

      {/* control bar */}
      {!running && (
        <div className="launch">
          <div className="launch-info">
            <div className="launch-num tnum">{counts.pending}</div>
            <div>
              <div style={{fontWeight:600,fontSize:15}}>accounts ready to {action}</div>
              <div className="muted" style={{fontSize:13}}>{counts.notfound>0 && `${counts.notfound} flagged not found · `}</div>
            </div>
          </div>
          <div className="row-gap">
            <Seg value={action} onChange={setAction} options={[{value:"block",label:"Block",icon:"block"},{value:"mute",label:"Mute",icon:"mute"}]} />
            <Btn variant="ghost" icon="upload" onClick={()=>fileRef.current.click()}>Import</Btn>
            <Btn variant="primary" icon="play" onClick={()=>onStart(action)}>Start {verbing}</Btn>
          </div>
        </div>
      )}
      {running && <ProgressHero run={run} action={action} onStop={onStop} />}

      {/* list toolbar */}
      <div className="list-toolbar">
        <div className="search">
          <Icon name="search" />
          <input className="input" placeholder="Search handles…" value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <div className="filter-chips">
          <button className={filter==="all"?"on":""} onClick={()=>setFilter("all")}>All <span className="mini tnum">{counts.all}</span></button>
          <button className={filter==="pending"?"on":""} onClick={()=>setFilter("pending")}>Pending <span className="mini tnum">{counts.pending}</span></button>
          <button className={filter==="notfound"?"on":""} onClick={()=>setFilter("notfound")}>Not found <span className="mini tnum">{counts.notfound}</span></button>
        </div>
        {!running && <Btn variant="danger-soft" size="sm" icon="trash" onClick={onClear}>Clear queue</Btn>}
      </div>

      {/* select-all row */}
      {shown.length>0 && (
        <div className="row-gap" style={{padding:"2px 14px 12px",color:"var(--text-2)",fontSize:13}}>
          <Check on={allSelShown} partial={!allSelShown && shownIds.some(id=>sel.has(id))} onClick={toggleAll} />
          <span style={{whiteSpace:"nowrap"}}>Select all {filter!=="all"?filter:""} ({shown.length})</span>
        </div>
      )}

      {/* rows */}
      {shown.length===0 ? (
        <Empty icon="search" title="Nothing matches" sub={q ? `No handles contain “${q}”.` : "No accounts in this filter. Suspended and deleted accounts may be hidden."} />
      ) : (
        <div className="rows">
          {shown.map(item => (
            <QueueRow key={item.id} item={item} action={action}
              selected={sel.has(item.id)} onToggleSel={()=>toggleSel(item.id)}
              processing={running && run.current===item.handle}
              onAct={()=>onActOne(item, action)} onRemove={()=>{ onRemove(item.id); toggleSel(item.id); sel.delete(item.id); }} />
          ))}
        </div>
      )}

      {/* bulk action bar */}
      {sel.size>0 && (
        <div className="bulkbar">
          <Check on onClick={clearSel} />
          <span className="count tnum">{sel.size} selected</span>
          <span className="spacer" />
          <Btn size="sm" variant="ghost" icon={action==="block"?"block":"mute"} onClick={()=>{
            const items = queue.filter(i=>sel.has(i.id)); items.forEach(it=>onActOne(it, action)); clearSel();
          }}>{verb} selected</Btn>
          <Btn size="sm" variant="danger-soft" icon="trash" onClick={()=>{ sel.forEach(id=>onRemove(id)); clearSel(); }}>Remove</Btn>
        </div>
      )}
    </div>
  );

  function Header(){
    return (
      <div className="page-head">
        <div className="page-eyebrow">Work queue</div>
        <h1 className="page-title">To Block</h1>
        <p className="page-sub">Queue accounts for an automated block or mute pass. Import from a JSON backup or CSV — the runner opens profiles in the background and acts one by one.</p>
      </div>
    );
  }
}
Object.assign(window, { ToBlock });
