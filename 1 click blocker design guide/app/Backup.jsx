/* Backup & Restore — scoped export/import/clear with confirm modal */
function Backup({ counts, onClear }){
  const [scope, setScope] = React.useState({ blocked:true, muted:true, settings:true });
  const [confirm, setConfirm] = React.useState(false);
  const fileRef = React.useRef();

  const SCOPES = [
    { id:"blocked", name:"Blocked users", desc:`${counts.blocked} accounts`, icon:"block" },
    { id:"muted", name:"Muted users", desc:`${counts.muted} accounts`, icon:"mute" },
    { id:"settings", name:"Settings & preferences", desc:"Default action, enabled pages, handle", icon:"gear" },
  ];
  const anySel = Object.values(scope).some(Boolean);
  const selNames = SCOPES.filter(s=>scope[s.id]).map(s=>s.name.toLowerCase());

  const toggle = id => setScope(s => ({ ...s, [id]: !s[id] }));

  const doExport = () => {
    const stamp = new Date().toISOString().slice(0,10);
    toast(`Exported <b>${selNames.length}</b> ${selNames.length===1?"category":"categories"} · one-click-blocker-${stamp}.json`, { kind:"success" });
  };
  const doImport = () => fileRef.current.click();

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div className="page-eyebrow">Safety & migration</div>
        <h1 className="page-title">Backup &amp; Restore</h1>
        <p className="page-sub">Export your data as JSON, restore it on another machine, or reset. Pick which categories each action applies to.</p>
      </div>

      <input ref={fileRef} type="file" accept=".json" hidden onChange={e=>{ toast(`Imported ${selNames.join(", ")} from backup`,{kind:"success"}); e.target.value=""; }} />

      <Section title="Choose categories" icon="sliders" desc="Shared selection for export, import and reset below.">
        <div className="rows">
          {SCOPES.map(s => (
            <button key={s.id} className={"row"+(scope[s.id]?" sel":"")} style={{cursor:"pointer"}} onClick={()=>toggle(s.id)}>
              <Check on={scope[s.id]} />
              <span className="chip-ico" style={scope[s.id]?{background:"var(--accent)",color:"#fff"}:null}><Icon name={s.icon} size={16} /></span>
              <div className="row-stack">
                <div style={{fontWeight:600,fontSize:"14.5px"}}>{s.name}</div>
                <div className="row-sub">{s.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </Section>

      <div className="section">
        <div className="section-body" style={{display:"flex",gap:11,flexWrap:"wrap",alignItems:"center"}}>
          <Btn variant="primary" icon="download" onClick={doExport} disabled={!anySel}>Export data</Btn>
          <Btn variant="ghost" icon="upload" onClick={doImport} disabled={!anySel}>Import data</Btn>
          <span style={{flex:1}} />
          <Btn variant="danger-soft" icon="trash" onClick={()=>setConfirm(true)} disabled={!anySel}>Reset selected</Btn>
        </div>
        <div className="divline" />
        <div className="section-body" style={{paddingTop:14,paddingBottom:16,color:"var(--text-2)",fontSize:13,display:"flex",gap:9,alignItems:"flex-start"}}>
          <Icon name="info" size={16} stroke="var(--text-3)" style={{flex:"none",marginTop:1}} />
          <span>Exports never include your X password or session. Only the handles this extension manages. The To Block queue has its own import on that tab.</span>
        </div>
      </div>

      <Modal open={confirm} danger icon="trash"
        title="Reset selected data?"
        text={<>This permanently clears <b>{selNames.join(", ")}</b> for @cottonpuree on this device. Export a backup first if you're not sure.</>}
        confirmLabel="Reset data" cancelLabel="Keep it"
        onCancel={()=>setConfirm(false)}
        onConfirm={()=>{ setConfirm(false); onClear(scope); toast(`Cleared ${selNames.join(", ")}`,{kind:"danger"}); }} />
    </div>
  );
}
Object.assign(window, { Backup });
