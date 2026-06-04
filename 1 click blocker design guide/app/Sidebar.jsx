/* Left sidebar — nav, account, theme toggle */
function Sidebar({ route, setRoute, counts, theme, setTheme, running, open, onClose }){
  const NAV = [
    { group:"Moderation" },
    { id:"queue", label:"To Block", icon:"queue", count:counts.queue, live:running },
    { id:"blocked", label:"Blocked", icon:"block", count:counts.blocked },
    { id:"muted", label:"Muted", icon:"mute", count:counts.muted },
    { group:"Account" },
    { id:"stats", label:"Statistics", icon:"stats" },
    { id:"settings", label:"Settings", icon:"gear" },
    { id:"backup", label:"Backup & Restore", icon:"backup" },
  ];
  return (
    <aside className={"sidebar"+(open?" open":"")}>
      <div className="brand">
        <div className="brand-mark"><Icon name="shield" size={20} stroke="#fff" /></div>
        <div>
          <div className="brand-name">One-Click Blocker</div>
          <div className="brand-tag">for X · v2</div>
        </div>
      </div>

      <nav className="nav">
        {NAV.map((n,i) => n.group
          ? <div key={"g"+i} className="nav-label">{n.group}</div>
          : (
            <button key={n.id} className={"nav-item"+(route===n.id?" active":"")} onClick={()=>{setRoute(n.id); onClose&&onClose();}}>
              <Icon name={n.icon} size={18} className="nav-ico" />
              <span className="label">{n.label}</span>
              {n.live ? <span className="nav-dot" title="Run in progress"></span>
                : (n.count!=null && n.count>0 && <span className="nav-count tnum">{n.count}</span>)}
            </button>
          )
        )}
      </nav>

      <div className="nav-foot">
        <div className="theme-toggle" role="group" aria-label="Theme">
          <button className={theme==="light"?"on":""} onClick={()=>setTheme("light")}><Icon name="sun" size={14} />Light</button>
          <button className={theme==="dark"?"on":""} onClick={()=>setTheme("dark")}><Icon name="moon" size={14} />Dark</button>
        </div>
        <button className="acct">
          <Avatar handle="cottonpuree" size="sm" />
          <div className="acct-meta">
            <div className="acct-name">@cottonpuree</div>
            <div className="acct-role">Active workspace</div>
          </div>
          <Icon name="chevron" size={15} stroke="var(--text-3)" />
        </button>
      </div>
    </aside>
  );
}
Object.assign(window, { Sidebar });
