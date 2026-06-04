/* Settings — account, default action, interface, page toggles */
function Settings({ settings, setSettings }){
  const [handle, setHandle] = React.useState(settings.handle);
  const pages = settings.pages;
  const enabledCount = Object.values(pages).filter(Boolean).length;

  const setPage = (id, val) => setSettings(s => ({ ...s, pages: { ...s.pages, [id]: val } }));
  const allOn = enabledCount === PAGE_TYPES.length;
  const toggleAllPages = () => {
    const next = {}; PAGE_TYPES.forEach(p => next[p.id] = !allOn);
    setSettings(s => ({ ...s, pages: next }));
    toast(allOn ? "Buttons hidden on all pages" : "Buttons enabled everywhere", { kind:"accent" });
  };

  const saveHandle = () => {
    const clean = handle.trim().replace(/^@/,"");
    setSettings(s => ({ ...s, handle: clean }));
    toast(`Lists now saved for <b>@${clean}</b>`, { kind:"success" });
  };

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div className="page-eyebrow">Configuration</div>
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">How the one-click button behaves on X. These are everyday defaults — the bulk queue has its own controls.</p>
      </div>

      {/* Account */}
      <Section title="Your X account" icon="user" desc="Block and mute lists are stored per handle. Auto-detected when you visit X — reassign if it's wrong." bordered>
        <div className="spread" style={{gap:14,flexWrap:"wrap"}}>
          <div className="input-prefix" style={{flex:1,minWidth:240}}>
            <span className="pfx">@</span>
            <input className="input" value={handle} onChange={e=>setHandle(e.target.value.replace(/^@/,""))} onKeyDown={e=>e.key==="Enter"&&saveHandle()} placeholder="your_handle" />
          </div>
          <Btn variant="primary" icon="check" onClick={saveHandle} disabled={handle.trim().replace(/^@/,"")===settings.handle}>Save handle</Btn>
        </div>
        <div className="row-gap mt14" style={{fontSize:13,color:"var(--text-2)"}}>
          <Tag kind="success" icon="check">Detected</Tag>
          Currently managing lists for <b style={{color:"var(--text)"}}>@{settings.handle}</b>
        </div>
      </Section>

      {/* Default action */}
      <Section title="Default action" icon="sliders" desc="What a single click does on the injected button. The bulk queue can override this per run.">
        <Seg size="lg" value={settings.action} onChange={v=>{ setSettings(s=>({...s,action:v})); toast(`Default set to <b>${v}</b>`,{kind:"accent"}); }}
          options={[{value:"block",label:"Block",icon:"block"},{value:"mute",label:"Mute",icon:"mute"}]} />
        <div className="field-help mt8">{settings.action==="block" ? "One click blocks the account immediately." : "One click mutes the account."}</div>
      </Section>

      {/* Interface */}
      <Section title="Interface" icon="eye" desc="Small conveniences on X itself.">
        <div className="field-row" style={{paddingTop:0}}>
          <div>
            <div className="field-label">Show settings shortcut on X</div>
            <div className="field-help">Adds a small icon to X pages that opens this control center in a new tab.</div>
          </div>
          <Switch on={settings.showGear} onClick={()=>{ setSettings(s=>({...s,showGear:!s.showGear})); toast("Settings saved!",{kind:"success"}); }} />
        </div>
      </Section>

      {/* Show button on */}
      <Section icon="compass"
        title={<span>Show button on <span className="muted tnum" style={{fontWeight:500,fontSize:14}}>· {enabledCount}/{PAGE_TYPES.length}</span></span>}
        desc="Pick the X surfaces where the one-click button appears. Saves instantly."
        action={<Btn size="sm" variant="quiet" onClick={toggleAllPages}>{allOn?"Disable all":"Enable all"}</Btn>}>
        <div className="chip-grid">
          {PAGE_TYPES.map(p => (
            <button key={p.id} className={"chip"+(pages[p.id]?" on":"")} onClick={()=>{ const v=!pages[p.id]; setPage(p.id,v); toast("Settings saved!",{kind:"success",ttl:1400}); }}>
              <span className="chip-ico"><Icon name={p.icon} size={16} /></span>
              <span className="chip-name">{p.name}</span>
              <Switch on={pages[p.id]} onClick={(e)=>{ e.stopPropagation(); const v=!pages[p.id]; setPage(p.id,v); toast("Settings saved!",{kind:"success",ttl:1400}); }} />
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
Object.assign(window, { Settings });
