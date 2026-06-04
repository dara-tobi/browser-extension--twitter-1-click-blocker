/* Reusable UI primitives */

function Avatar({ handle, size }){
  const a = avatarFor(handle);
  const cls = "avatar" + (size ? " "+size : "");
  return <div className={cls} style={{ background:a.grad }}>{a.initial}</div>;
}

function Switch({ on, onClick }){
  return <button type="button" className={"switch"+(on?" on":"")} onClick={onClick} aria-pressed={on}></button>;
}

function Check({ on, partial, onClick }){
  return (
    <button type="button" className={"check"+(on?" on":"")+(partial?" partial":"")} onClick={onClick} aria-checked={on}>
      <Icon name={partial?"minus":"check"} size={13} />
    </button>
  );
}

function Btn({ variant, size, icon, iconR, children, className, ...rest }){
  const cls = ["btn", variant?("btn-"+variant):"btn-ghost", size?("btn-"+size):"", className||""].join(" ").trim();
  return (
    <button className={cls} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
      {iconR && <Icon name={iconR} />}
    </button>
  );
}

function Seg({ value, onChange, options, size }){
  return (
    <div className={"seg"+(size==="lg"?" lg":"")}>
      {options.map(o => (
        <button key={o.value} className={(value===o.value?"on accent":"")} onClick={()=>onChange(o.value)}>
          {o.icon && <Icon name={o.icon} />}{o.label}
        </button>
      ))}
    </div>
  );
}

function Tag({ kind, icon, children }){
  return <span className={"tag tag-"+(kind||"muted")}>{icon && <Icon name={icon} size={12} />}{children}</span>;
}

function Section({ title, icon, desc, action, children, bordered }){
  return (
    <div className="section">
      <div className={"section-head"+(bordered?" bordered":"")}>
        <div className="spread">
          <div>
            <h3 className="section-title">{icon && <Icon name={icon} size={18} stroke="var(--text-2)" />}{title}</h3>
            {desc && <p className="section-desc">{desc}</p>}
          </div>
          {action}
        </div>
      </div>
      {children && <div className="section-body">{children}</div>}
    </div>
  );
}

function Empty({ icon, title, sub, action }){
  return (
    <div className="empty">
      <div className="empty-art"><Icon name={icon||"ghost"} size={38} /></div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
      {action && <div className="mt18">{action}</div>}
    </div>
  );
}

/* Confirm modal */
function Modal({ open, danger, icon, title, text, confirmLabel, cancelLabel, onConfirm, onCancel }){
  if (!open) return null;
  const accent = danger ? "var(--danger)" : "var(--accent)";
  const soft = danger ? "var(--danger-soft)" : "var(--accent-soft)";
  return (
    <div className="scrim" onClick={onCancel}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-body">
          <div className="modal-ico" style={{ background:soft, color:accent }}><Icon name={icon||"alert"} size={26} /></div>
          <div className="modal-title">{title}</div>
          <div className="modal-text">{text}</div>
        </div>
        <div className="modal-foot">
          <Btn variant="ghost" onClick={onCancel}>{cancelLabel||"Cancel"}</Btn>
          <Btn variant={danger?"danger":"primary"} onClick={onConfirm}>{confirmLabel||"Confirm"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* Toast host — uses a ref-based queue via window.__toast */
function ToastHost(){
  const [items, setItems] = React.useState([]);
  React.useEffect(()=>{
    window.__toast = (msg, opts={}) => {
      const id = Date.now()+Math.random();
      setItems(prev => [...prev.slice(-3), { id, msg, kind:opts.kind||"default" }]);
      const ttl = opts.ttl || 2400;
      setTimeout(()=> setItems(prev => prev.map(t => t.id===id?{...t,out:true}:t)), ttl);
      setTimeout(()=> setItems(prev => prev.filter(t => t.id!==id)), ttl+320);
    };
  },[]);
  const color = { success:"var(--success)", danger:"var(--danger)", warn:"var(--warn)", accent:"var(--accent)", default:"var(--text-3)" };
  const ic = { success:"check", danger:"x", warn:"alert", accent:"info", default:"info" };
  return (
    <div className="toasts">
      {items.map(t => (
        <div key={t.id} className={"toast"+(t.out?" out":"")}>
          <span className="toast-ico" style={{ background:color[t.kind] }}><Icon name={ic[t.kind]} size={13} /></span>
          <span dangerouslySetInnerHTML={{ __html: t.msg }} />
        </div>
      ))}
    </div>
  );
}
const toast = (msg, opts) => window.__toast && window.__toast(msg, opts);

Object.assign(window, { Avatar, Switch, Check, Btn, Seg, Tag, Section, Empty, Modal, ToastHost, toast });
