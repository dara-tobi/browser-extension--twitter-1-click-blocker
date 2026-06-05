/* App shell — state, simulated run loop, routing, theme */
function App(){
  const [route, setRoute] = React.useState(() => localStorage.getItem("ocb_route") || "queue");
  const [theme, setThemeState] = React.useState(() => localStorage.getItem("ocb_theme") || "dark");
  const [sbOpen, setSbOpen] = React.useState(false);

  const [queue, setQueue] = React.useState(() => makeQueue());
  const [blocked, setBlocked] = React.useState(() => BLOCKED.slice());
  const [muted, setMuted] = React.useState(() => MUTED.slice());
  const [stats, setStats] = React.useState({ blocks: 6, mutes: 13 });
  const [settings, setSettings] = React.useState({ handle:"cottonpuree", action:"mute", showGear:true, pages:{...DEFAULT_PAGES} });
  const [action, setAction] = React.useState("block");

  const [run, setRun] = React.useState({ active:false, action:"block", current:null, processed:0, doneCount:0, notFoundCount:0, total:0 });
  const runRef = React.useRef(null);

  // theme + route persistence
  React.useEffect(()=>{ document.documentElement.setAttribute("data-theme", theme); localStorage.setItem("ocb_theme", theme); },[theme]);
  React.useEffect(()=>{ localStorage.setItem("ocb_route", route); },[route]);
  const setTheme = t => setThemeState(t);

  // ---- run loop ----
  const startRun = (act) => {
    const pending = queue.filter(i=>i.status==="pending");
    if (pending.length===0){ toast("Queue is empty. Import a list first.",{kind:"warn"}); return; }
    setAction(act);
    setRun({ active:true, action:act, current:null, processed:0, doneCount:0, notFoundCount:0, total:pending.length });
    let idx = 0;
    const ids = pending.map(p=>p.id);
    runRef.current = setInterval(()=>{
      if (idx >= ids.length){ finishRun(act); return; }
      const id = ids[idx]; idx++;
      setQueue(prev => {
        const item = prev.find(i=>i.id===id);
        if (!item) return prev;
        setRun(r => ({ ...r, current:item.handle, processed:r.processed+1 }));
        if (item.notFound){
          setRun(r => ({ ...r, notFoundCount:r.notFoundCount+1 }));
          toast(`<b>@${item.handle}</b> no longer exists`, { kind:"warn", ttl:1600 });
          return prev; // keep not-found in queue
        }
        // success → remove from queue, add to ledger, bump stats
        setRun(r => ({ ...r, doneCount:r.doneCount+1 }));
        const rec = { id:item.id, handle:item.handle, when:0 };
        if (act==="block"){ setBlocked(b=>[rec,...b]); setStats(s=>({...s,blocks:s.blocks+1})); }
        else { setMuted(m=>[rec,...m]); setStats(s=>({...s,mutes:s.mutes+1})); }
        toast(`<b>@${item.handle}</b> ${act==="block"?"blocked":"muted"}`, { kind:"success", ttl:1500 });
        return prev.filter(i=>i.id!==id);
      });
    }, 850);
  };
  const finishRun = (act) => {
    clearInterval(runRef.current); runRef.current = null;
    setRun(r => {
      toast(`${act==="block"?"Blocking":"Muting"} run complete · <b>${r.doneCount}</b> done, ${r.notFoundCount} not found`, { kind:"accent", ttl:3200 });
      return { ...r, active:false, current:null };
    });
  };
  const stopRun = () => {
    clearInterval(runRef.current); runRef.current = null;
    setRun(r => { toast(`Run stopped · ${r.doneCount} done so far`, { kind:"warn" }); return { ...r, active:false, current:null }; });
  };
  React.useEffect(()=>()=>clearInterval(runRef.current), []);

  // ---- queue ops ----
  const importList = () => {
    const extra = ["new_spammer_01","fake_giveaway","copypasta_x","bot_swarm_22","phish_link_co"].map((h,i)=>({ id:90000+i, handle:h, notFound:false, status:"pending", selected:false }));
    setQueue(q => {
      const have = new Set(q.map(i=>i.handle));
      const add = extra.filter(e=>!have.has(e.handle));
      toast(`Imported · <b>${add.length}</b> added, ${extra.length-add.length} already queued`, { kind:"success" });
      return [...add, ...q];
    });
  };
  const clearQueue = () => setConfirmClear(true);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const removeFromQueue = (id) => setQueue(q => q.filter(i=>i.id!==id));
  const actOne = (item, act) => {
    if (item.notFound){ toast(`<b>@${item.handle}</b> no longer exists`,{kind:"warn"}); return; }
    setQueue(q => q.filter(i=>i.id!==item.id));
    const rec = { id:item.id, handle:item.handle, when:0 };
    if (act==="block"){ setBlocked(b=>[rec,...b]); setStats(s=>({...s,blocks:s.blocks+1})); }
    else { setMuted(m=>[rec,...m]); setStats(s=>({...s,mutes:s.mutes+1})); }
    toast(`<b>@${item.handle}</b> ${act==="block"?"blocked":"muted"}`, { kind:"success", ttl:1500 });
  };

  const unblock = (id) => setBlocked(b=>b.filter(i=>i.id!==id));
  const unmute  = (id) => setMuted(m=>m.filter(i=>i.id!==id));

  const clearData = (scope) => {
    if (scope.blocked) setBlocked([]);
    if (scope.muted) setMuted([]);
    if (scope.settings) setSettings({ handle:"cottonpuree", action:"block", showGear:true, pages:{...DEFAULT_PAGES} });
  };

  const counts = { queue:queue.length, blocked:blocked.length, muted:muted.length };

  return (
    <div className="app">
      <Sidebar route={route} setRoute={setRoute} counts={counts} theme={theme} setTheme={setTheme} running={run.active} open={sbOpen} onClose={()=>setSbOpen(false)} />
      <div className="main">
        <div className="mobile-bar">
          <button className="btn-icon" onClick={()=>setSbOpen(true)}><Icon name="menu" size={20} /></button>
          <div className="brand-mark" style={{width:28,height:28,borderRadius:8}}><Icon name="shield" size={16} stroke="#fff" /></div>
          <b>One-Click Blocker</b>
        </div>
        <div className="main-scroll">
          {route==="queue" && <ToBlock queue={queue} action={action} setAction={setAction} run={run}
            onStart={startRun} onStop={stopRun} onClear={clearQueue} onImport={importList} onRemove={removeFromQueue} onActOne={actOne} />}
          {route==="blocked" && <ListTab kind="blocked" items={blocked} onUndo={unblock} />}
          {route==="muted" && <ListTab kind="muted" items={muted} onUndo={unmute} />}
          {route==="stats" && <Stats stats={stats} queueLen={queue.length} />}
          {route==="settings" && <Settings settings={settings} setSettings={setSettings} />}
          {route==="backup" && <Backup counts={counts} onClear={clearData} />}
        </div>
      </div>

      <Modal open={confirmClear} danger icon="trash"
        title="Clear the entire to-block queue?"
        text="This removes all queued accounts and their not-found tags. It does not undo anything already blocked or muted."
        confirmLabel="Clear queue" cancelLabel="Keep queue"
        onCancel={()=>setConfirmClear(false)}
        onConfirm={()=>{ setConfirmClear(false); setQueue([]); toast("Queue cleared",{kind:"danger"}); }} />

      <ToastHost />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
