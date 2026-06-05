/* Statistics — hero numbers + 14-day activity chart */
function Stats({ stats, queueLen }){
  const maxBar = Math.max(...ACTIVITY.map(d => d[0]+d[1]), 1);
  const totalBlocks = stats.blocks, totalMutes = stats.mutes;
  const last7 = ACTIVITY.slice(-7).reduce((a,d)=>a+d[0]+d[1],0);

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div className="page-eyebrow">Insights</div>
        <h1 className="page-title">Statistics</h1>
        <p className="page-sub">Actions completed through the extension. Counts increment when a block or mute succeeds. They do not pull from X's API.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="ico" style={{background:"var(--accent-soft)",color:"var(--accent)"}}><Icon name="block" size={20} /></div>
          <div className="big tnum">{totalBlocks.toLocaleString()}</div>
          <div className="cap"><span style={{whiteSpace:"nowrap"}}>Total blocks</span> <span className="trend"><Icon name="trend" size={12} style={{verticalAlign:"-2px"}} /> all time</span></div>
        </div>
        <div className="stat-card">
          <div className="ico" style={{background:"var(--warn-soft)",color:"var(--warn)"}}><Icon name="mute" size={20} /></div>
          <div className="big tnum">{totalMutes.toLocaleString()}</div>
          <div className="cap"><span style={{whiteSpace:"nowrap"}}>Total mutes</span> <span className="trend"><Icon name="trend" size={12} style={{verticalAlign:"-2px"}} /> all time</span></div>
        </div>
      </div>

      <Section title="Activity" icon="stats" desc="Blocks and mutes over the last 14 days.">
        <div className="chart">
          {ACTIVITY.map((d,i) => {
            const total = d[0]+d[1];
            const h = (total/maxBar)*100;
            const bh = total ? (d[0]/total)*100 : 0;
            return (
              <div className="chart-col" key={i} title={`${d[0]} blocks · ${d[1]} mutes`}>
                <div style={{height:h+"%",display:"flex",flexDirection:"column",justifyContent:"flex-end",gap:2}}>
                  {d[1]>0 && <div className="bar mute" style={{height:(100-bh)+"%"}} />}
                  {d[0]>0 && <div className="bar block" style={{height:bh+"%"}} />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="chart" style={{height:"auto",padding:0,alignItems:"flex-start"}}>
          {ACTIVITY.map((d,i)=><div className="chart-x" style={{flex:1}} key={i}>{14-i}d</div>)}
        </div>
        <div className="legend">
          <span><i style={{background:"var(--accent)"}} />Blocks</span>
          <span><i style={{background:"var(--accent-soft)"}} />Mutes</span>
          <span style={{marginLeft:"auto",fontFamily:"var(--font-mono)",fontSize:11.5}}>{last7} actions this week · {queueLen} in queue</span>
        </div>
      </Section>
    </div>
  );
}
Object.assign(window, { Stats });
