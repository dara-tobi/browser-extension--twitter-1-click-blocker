/* Blocked + Muted ledger tabs — search, sort, read-with-undo */
function ListTab({ kind, items, onUndo }){
  const isBlocked = kind==="blocked";
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState("recent");

  let shown = items.filter(i => !q || i.handle.toLowerCase().includes(q.toLowerCase()));
  shown = [...shown].sort((a,b)=> sort==="recent" ? a.when-b.when : a.handle.localeCompare(b.handle));

  const title = isBlocked ? "Blocked" : "Muted";
  const verb = isBlocked ? "Unblock" : "Unmute";
  const tone = isBlocked ? "block" : "mute";

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div className="page-eyebrow">Completed ledger</div>
        <h1 className="page-title">{title} <span className="muted tnum" style={{fontSize:20,fontWeight:500}}>{items.length}</span></h1>
        <p className="page-sub">Accounts this extension has {isBlocked?"blocked":"muted"} on <b>@cottonpuree</b>. This is the extension's own record, it is not a live mirror of X.</p>
      </div>

      {items.length===0 ? (
        <div className="card"><Empty icon={isBlocked?"block":"mute"} title={`No ${tone}ed users yet`} sub={`Accounts you ${tone} through the extension will be recorded here.`} /></div>
      ) : (
        <>
          <div className="list-toolbar">
            <div className="search">
              <Icon name="search" />
              <input className="input" placeholder={`Search ${items.length} handles…`} value={q} onChange={e=>setQ(e.target.value)} />
            </div>
            <div className="filter-chips">
              <button className={sort==="recent"?"on":""} onClick={()=>setSort("recent")}>Recent</button>
              <button className={sort==="az"?"on":""} onClick={()=>setSort("az")}>A–Z</button>
            </div>
          </div>

          {shown.length===0 ? (
            <Empty icon="search" title="Nothing matches" sub={`No handles contain “${q}”.`} />
          ) : (
            <div className="rows">
              {shown.map(item => (
                <div className="row" key={item.id}>
                  <Avatar handle={item.handle} size="sm" />
                  <div className="row-stack">
                    <div className="row-handle">
                      <a className="h" href={"https://x.com/"+item.handle} target="_blank" rel="noopener">@{item.handle}</a>
                      <Icon name="ext" size={13} stroke="var(--text-3)" />
                    </div>
                    <div className="row-sub">{tone}ed {item.when}d ago</div>
                  </div>
                  <div className="row-actions">
                    <Btn size="sm" variant="ghost" onClick={()=>{ onUndo(item.id); toast(`<b>@${item.handle}</b> ${verb.toLowerCase()}ed`,{kind:"accent"}); }}>{verb}</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
Object.assign(window, { ListTab });
