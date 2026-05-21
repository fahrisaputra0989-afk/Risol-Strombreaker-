import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── GANTI INI DENGAN CONFIG KAMU ───────────────────────────
const SUPABASE_URL = "https://lzcqssxryoepwujyszfj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_MQxyP2LjaUV11-qXDRW3xA_3Qk9a8o7";
const TOKO_NAMA = "Risol Strombreaker";
// ────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MENU = [
  { id: 1, name: "Risol Mentai Ayam", emoji: "🥐", price: 3000, desc: "Isian ayam suwir + saus mentai creamy" },
  { id: 2, name: "Risol Mentai Sosis", emoji: "🌭", price: 3000, desc: "saus mentai gurih + sosis berkualitas" },
  { id: 3, name: "Risol Mentai Daging", emoji: "🥩", price: 3000, desc: "daging sapi berkualitas + saus mentai lumer" },
  { id: 4, name: "Risol Mayo Sayur", emoji: "🥦", price: 2500, desc: "saus mayo lumer + sayuran" },
  { id: 5, name: "Risol Ayam Pedas", emoji: "🌶️", price: 3000, desc: "ayam + cabe rawit nendang!" },
  { id: 6, name: "Risol Mayo Ayam", emoji: "🍗", price: 3000, desc: "ayam + saus mayo gurih" },
  { id: 7, name: "Risol Mayo Sosis", emoji: "🌭", price: 3000, desc: "Sosis lezat + saus mayo Lumer" },
  { id: 8, name: "Risol Mayo Daging", emoji: "🥩", price: 3000, desc: "daging sapi lembut + saus mayo gurih" },
];

const PAYMENT = [
  { id: "gopay",     name: "GoPay",           color: "#00AED6", num: "0851-1304-1487", icon: "💙" },
  { id: "dana",      name: "DANA",             color: "#118EEA", num: "0851-1304-1487", icon: "💠" },
  { id: "ovo",       name: "OVO",              color: "#4C3494", num: "0851-1304-1487", icon: "💜" },
  { id: "shopeepay", name: "ShopeePay",        color: "#EE4D2D", num: "0851-1304-1487", icon: "🧡" },
  { id: "COD",       name: "Cash On Delivery", color: "#de6c02", num: "Bayar di Tempat", icon: "💵" },
];

const STATUS_LABEL = {
  pending:    { label: "⏳ Menunggu",    bg: "#FFF3CD", color: "#856404" },
  confirmed:  { label: "✅ Dikonfirmasi", bg: "#D1FAE5", color: "#065F46" },
  processing: { label: "👩‍🍳 Diproses",   bg: "#DBEAFE", color: "#1E40AF" },
  delivered:  { label: "🚀 Dikirim",     bg: "#EDE9FE", color: "#5B21B6" },
  done:       { label: "🎉 Selesai",     bg: "#D1FAE5", color: "#065F46" },
};

const fmtRp  = n => "Rp " + Number(n).toLocaleString("id-ID");
const fmtDate = s => new Date(s).toLocaleString("id-ID", { dateStyle:"medium", timeStyle:"short" });

// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage]     = useState("menu");  // menu|checkout|confirm|success|dashboard
  const [cart, setCart]     = useState({});
  const [form, setForm]     = useState({ name:"", phone:"", address:"", note:"", payment:"" });
  const [errors, setErrors] = useState({});
  const [proofFile, setProofFile]  = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [loading, setLoading]      = useState(false);
  const [orderId, setOrderId]      = useState(null);
  const [orders, setOrders]        = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [dashPin, setDashPin]      = useState("");
  const [dashUnlocked, setDashUnlocked] = useState(false);
  const DASH_PIN = "271127"; // ganti PIN dashboard

  // Cart helpers
  const addItem = (item) => setCart(c => ({ ...c, [item.id]: (c[item.id]||0)+1 }));
  const remItem = (id)   => setCart(c => { const n={...c}; n[id]>1?n[id]--:delete n[id]; return n; });
  const cartItems = Object.entries(cart).map(([id,qty]) => ({ ...MENU.find(m=>m.id===+id), qty }));
  const totalItems = cartItems.reduce((a,i)=>a+i.qty, 0);
  const totalPrice = cartItems.reduce((a,i)=>a+i.price*i.qty, 0);

  const validate = () => {
    const e = {};
    if (!form.name.trim())    e.name    = "Nama wajib diisi";
    if (!form.phone.trim())   e.phone   = "No. WhatsApp wajib diisi";
    if (!form.address.trim()) e.address = "Alamat wajib diisi";
    if (!form.payment)        e.payment = "Pilih metode pembayaran";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleProofChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  };

  // ── SUBMIT ORDER ─────────────────────────────────────────────
  const submitOrder = async () => {
    setLoading(true);
    try {
      // 1. Upload bukti bayar ke Supabase Storage (kalau ada)
      let proofUrl = null;
      if (proofFile) {
        const ext  = proofFile.name.split(".").pop();
        const path = `bukti/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("payment-proofs").upload(path, proofFile);
        if (!upErr) {
          const { data } = supabase.storage.from("payment-proofs").getPublicUrl(path);
          proofUrl = data.publicUrl;
        }
      }

      // 2. Simpan order ke database
      const items = cartItems.map(i => ({ id:i.id, name:i.name, qty:i.qty, price:i.price }));
      const { data: newOrder, error } = await supabase.from("orders").insert([{
        customer_name:    form.name,
        customer_phone:   form.phone,
        customer_address: form.address,
        note:             form.note,
        payment_method:   form.payment,
        items:            items,
        total_price:      totalPrice,
        proof_url:        proofUrl,
        status:           "pending",
      }]).select().single();

      if (error) throw error;
      setOrderId(newOrder.id);

      setPage("success");
    } catch (err) {
      alert("Gagal kirim pesanan: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── LOAD ORDERS (Dashboard) ───────────────────────────────────
  const loadOrders = async () => {
    setLoadingOrders(true);
    const { data } = await supabase.from("orders")
      .select("*").order("created_at", { ascending:false });
    setOrders(data || []);
    setLoadingOrders(false);
  };

  const updateStatus = async (id, status) => {
    await supabase.from("orders").update({ status }).eq("id", id);
    setOrders(o => o.map(x => x.id===id ? {...x, status} : x));
  };

  useEffect(() => { if (page === "dashboard" && dashUnlocked) loadOrders(); }, [page, dashUnlocked]);

  const selectedPay = PAYMENT.find(p => p.id === form.payment);

  // ════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#FFF8EE,#FFF3E0,#FFF9F0)", fontFamily:"'Nunito',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Pacifico&display=swap');
        *{box-sizing:border-box} body{margin:0}
        .card{background:#fff;border-radius:20px;padding:20px;box-shadow:0 4px 20px rgba(244,160,58,.13);border:1.5px solid #FFE8C4;margin-bottom:16px}
        .btn{border:none;border-radius:14px;padding:13px 0;font-weight:800;font-size:15px;cursor:pointer;width:100%;transition:all .15s}
        .btn:hover{filter:brightness(1.07);transform:translateY(-1px)}
        .btn-primary{background:linear-gradient(135deg,#E67E22,#F4A03A);color:#fff;box-shadow:0 6px 20px rgba(230,126,34,.35)}
        .btn-outline{background:#FFF3E0;color:#E67E22;border:2px solid #FFD49A !important}
        .btn-green{background:linear-gradient(135deg,#27AE60,#2ECC71);color:#fff;box-shadow:0 6px 20px rgba(39,174,96,.35)}
        .inp{width:100%;padding:12px 14px;border:1.5px solid #FFD49A;border-radius:12px;font-size:14px;color:#333;background:#FFFDF8;font-family:'Nunito',sans-serif;outline:none;transition:all .15s}
        .inp:focus{border-color:#E67E22;box-shadow:0 0 0 3px rgba(230,126,34,.15)}
        .inp.err{border-color:#e74c3c}
        label span.lbl{display:block;font-size:13px;font-weight:700;color:#5D4037;margin-bottom:6px}
        .errtxt{color:#e74c3c;font-size:12px;margin-top:4px;display:block}
        .pay-opt{border-radius:14px;padding:12px 16px;cursor:pointer;transition:all .15s;border:2px solid #FFD49A;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .menu-card{background:#fff;border-radius:20px;padding:14px;border:1.5px solid #FFE8C4;box-shadow:0 4px 14px rgba(244,160,58,.1);transition:transform .18s,box-shadow .18s}
        .menu-card:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(244,160,58,.22)!important}
        .slide{animation:sl .3s cubic-bezier(.4,0,.2,1)}
        @keyframes sl{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .badge{background:#E67E22;color:#fff;border-radius:10px;padding:1px 7px;font-size:12px;font-weight:800}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#FFF3E0;color:#E67E22;font-weight:800;padding:10px 8px;text-align:left}
        td{padding:10px 8px;border-bottom:1px solid #FFE8C4;color:#4A2C0A;vertical-align:top}
        tr:hover td{background:#FFFDF8}
        select.inp{appearance:none}
      `}</style>

       {/* ── HEADER ── */}
      <header style={{ background:"linear-gradient(135deg,#E67E22,#F39C12,#F4A03A)", position:"sticky", top:0, zIndex:100, boxShadow:"0 4px 20px rgba(230,126,34,.35)" }}>
        <div style={{ maxWidth:580, margin:"0 auto", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          
          <div style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:"12px" }} onClick={() => setPage("menu")}>
            {/* Logo Lingkaran dengan Border Tipis */}
            <img 
              src="https://i.postimg.cc/sD41R2yZ/𝐒𝐓𝐑𝐎𝐌𝐁𝐑𝐄𝐀𝐊𝐄𝐑𝐒-20260507-184223.jpg" 
              alt="Logo Strombreaker" 
              style={{ 
                width: "42px", 
                height: "42px", 
                borderRadius: "50%", 
                objectFit: "cover", 
                border: "2px solid #ffffff",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }} 
            />

            <div>
              <div style={{ fontFamily:"'Pacifico',cursive", fontSize:24, color:"#fff", textShadow:"0 2px 8px rgba(0,0,0,.18)" }}>{TOKO_NAMA}</div>
              <div style={{ color:"rgba(255,255,255,.85)", fontSize:10, fontWeight:700, letterSpacing:2, textTransform:"uppercase" }}>Homemade · Enak · Murah</div>
            </div>
          </div>

          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {page==="menu" && totalItems>0 && (
              <button onClick={()=>setPage("checkout")} style={{ background:"#fff", border:"none", borderRadius:22, padding:"9px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:8, fontWeight:800, color:"#E67E22", fontSize:13, boxShadow:"0 4px 14px rgba(0,0,0,.15)" }}>
                🛒 <span className="badge">{totalItems}</span>
                <span style={{ background:"#E67E22", color:"#fff", borderRadius:10, padding:"2px 8px", fontSize:12 }}>{fmtRp(totalPrice)}</span>
              </button>
            )}
            {page!=="menu" && page!=="dashboard" && page!=="success" && (
              <button onClick={()=>setPage("menu")} style={{ background:"rgba(255,255,255,.2)", border:"none", borderRadius:18, padding:"8px 14px", cursor:"pointer", color:"#fff", fontWeight:700, fontSize:13 }}>← Menu</button>
            )}
            <button onClick={()=>setPage("dashboard")} style={{ background:"rgba(255,255,255,.18)", border:"1px solid rgba(255,255,255,.4)", borderRadius:18, padding:"8px 12px", cursor:"pointer", color:"#fff", fontWeight:700, fontSize:12 }}>⚙️ Penjual</button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth:580, margin:"0 auto", padding:"0 16px 100px" }}>

        {/* ══ MENU ══ */}
        {page==="menu" && (
          <div className="slide">
            <div style={{ textAlign:"center", padding:"22px 0 10px" }}>
              <div style={{ fontFamily:"'Pacifico',cursive", fontSize:21, color:"#E67E22" }}>Menu Hari Ini 🔥</div>
              <div style={{ color:"#A0856A", fontSize:13, marginTop:4 }}>Klik + buat tambah ke keranjang</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {MENU.map(item => (
                <div key={item.id} className="menu-card">
                  <div style={{ fontSize:42, textAlign:"center", marginBottom:8 }}>{item.emoji}</div>
                  <div style={{ fontWeight:800, fontSize:13, color:"#4A2C0A", lineHeight:1.3 }}>{item.name}</div>
                  <div style={{ fontSize:11, color:"#A0856A", margin:"4px 0 10px", lineHeight:1.4 }}>{item.desc}</div>
                  <div style={{ fontWeight:900, color:"#E67E22", fontSize:15, marginBottom:10 }}>{fmtRp(item.price)}</div>
                  {cart[item.id] ? (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#FFF3E0", borderRadius:10, padding:"4px 8px" }}>
                      <button onClick={()=>remItem(item.id)} style={{ background:"#E67E22", border:"none", borderRadius:7, width:27, height:27, color:"#fff", fontWeight:900, cursor:"pointer", fontSize:16 }}>−</button>
                      <span style={{ fontWeight:900, color:"#E67E22" }}>{cart[item.id]}</span>
                      <button onClick={()=>addItem(item)} style={{ background:"#E67E22", border:"none", borderRadius:7, width:27, height:27, color:"#fff", fontWeight:900, cursor:"pointer", fontSize:16 }}>+</button>
                    </div>
                  ) : (
                    <button onClick={()=>addItem(item)} className="btn btn-primary" style={{ fontSize:13, padding:"8px 0", borderRadius:10 }}>+ Tambah</button>
                  )}
                </div>
              ))}
            </div>
            {totalItems>0 && (
              <div className="card" style={{ marginTop:16 }}>
                <div style={{ fontWeight:800, color:"#E67E22", marginBottom:10 }}>🛒 Keranjang</div>
                {cartItems.map(i=>(
                  <div key={i.id} style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13, color:"#5D4037" }}>
                    <span>{i.emoji} {i.name} <span style={{ color:"#A0856A" }}>×{i.qty}</span></span>
                    <b style={{ color:"#E67E22" }}>{fmtRp(i.price*i.qty)}</b>
                  </div>
                ))}
                <div style={{ borderTop:"2px dashed #FFD49A", marginTop:10, paddingTop:10, display:"flex", justifyContent:"space-between", fontWeight:900, fontSize:17, color:"#E67E22" }}>
                  <span>Total</span><span>{fmtRp(totalPrice)}</span>
                </div>
                <button className="btn btn-primary" style={{ marginTop:14 }} onClick={()=>setPage("checkout")}>Lanjut Pesan →</button>
              </div>
            )}
          </div>
        )}

        {/* ══ CHECKOUT ══ */}
        {page==="checkout" && (
          <div className="slide">
            <div style={{ textAlign:"center", padding:"22px 0 8px" }}>
              <div style={{ fontFamily:"'Pacifico',cursive", fontSize:21, color:"#E67E22" }}>Data Pesanan 📝</div>
            </div>

            {/* Ringkasan */}
            <div className="card">
              <div style={{ fontWeight:800, color:"#E67E22", marginBottom:10 }}>🛒 Pesananmu</div>
              {cartItems.map(i=>(
                <div key={i.id} style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13, color:"#5D4037" }}>
                  <span>{i.emoji} {i.name} ×{i.qty}</span><b style={{ color:"#E67E22" }}>{fmtRp(i.price*i.qty)}</b>
                </div>
              ))}
              <div style={{ borderTop:"2px dashed #FFD49A", marginTop:10, paddingTop:10, display:"flex", justifyContent:"space-between", fontWeight:900, fontSize:16, color:"#E67E22" }}>
                <span>💰 Total</span><span>{fmtRp(totalPrice)}</span>
              </div>
            </div>

            {/* Form */}
            <div className="card">
              <div style={{ fontWeight:800, color:"#E67E22", marginBottom:14 }}>👤 Data Diri</div>
              {[
                { key:"name",    label:"Nama Lengkap *",       placeholder:"Budi Santoso",          type:"text"  },
                { key:"phone",   label:"No. WhatsApp *",       placeholder:"08123456789",            type:"tel"   },
                { key:"address", label:"Alamat Lengkap *",     placeholder:"Jl. Melati No. 10...",   type:"area"  },
                { key:"note",    label:"💬 Pesan untuk Penjual", placeholder:"Jangan terlalu matang...", type:"area", optional:true },
              ].map(f => (
                <label key={f.key} style={{ display:"block", marginBottom:14 }}>
                  <span className="lbl">{f.label}{f.optional && <span style={{ fontWeight:400, color:"#A0856A" }}> (opsional)</span>}</span>
                  {f.type==="area"
                    ? <textarea rows={2} className={`inp${errors[f.key]?" err":""}`} value={form[f.key]}
                        onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} />
                    : <input type={f.type} className={`inp${errors[f.key]?" err":""}`} value={form[f.key]}
                        onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} />
                  }
                  {errors[f.key] && <span className="errtxt">⚠ {errors[f.key]}</span>}
                </label>
              ))}
            </div>

            {/* Pembayaran */}
            <div className="card" style={{ border:`1.5px solid ${errors.payment?"#e74c3c":"#FFE8C4"}` }}>
              <div style={{ fontWeight:800, color:"#E67E22", marginBottom:4 }}>💳 Metode Pembayaran *</div>
              {errors.payment && <span className="errtxt" style={{ marginBottom:8 }}>⚠ {errors.payment}</span>}
              {PAYMENT.map(p=>(
                <div key={p.id} className="pay-opt"
                  style={{ border:`2px solid ${form.payment===p.id?p.color:"#FFD49A"}`, background:form.payment===p.id?p.color+"18":"#FFFDF8" }}
                  onClick={()=>setForm(f=>({...f,payment:p.id}))}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:22 }}>{p.icon}</span>
                    <div>
                      <div style={{ fontWeight:800, fontSize:13, color:form.payment===p.id?p.color:"#333" }}>{p.name}</div>
                      {form.payment===p.id && p.id !== "COD" && <div style={{ fontSize:12, color:"#666", marginTop:2 }}>📲 {p.num}</div>}
                    </div>
                  </div>
                  <div style={{ width:20, height:20, borderRadius:"50%", border:`2px solid ${form.payment===p.id?p.color:"#FFD49A"}`, background:form.payment===p.id?p.color:"transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    {form.payment===p.id && <span style={{ color:"#fff", fontSize:12 }}>✓</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Upload Bukti Bayar */}
            <div className="card">
              <div style={{ fontWeight:800, color:"#E67E22", marginBottom:4 }}>🧾 Upload Bukti Pembayaran</div>
              <div style={{ color:"#A0856A", fontSize:12, marginBottom:12 }}>Opsional, bisa dikirim nanti lewat WhatsApp (kalau diperlukan)</div>
              <label style={{ display:"block", border:"2px dashed #FFD49A", borderRadius:14, padding:20, textAlign:"center", cursor:"pointer", background:"#FFFDF8", transition:"all .15s" }}
                onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f){setProofFile(f);setProofPreview(URL.createObjectURL(f))}}}>
                <input type="file" accept="image/*" style={{ display:"none" }} onChange={handleProofChange} />
                {proimport { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── GANTI INI DENGAN CONFIG KAMU ───────────────────────────
const SUPABASE_URL = "https://lzcqssxryoepwujyszfj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_MQxyP2LjaUV11-qXDRW3xA_3Qk9a8o7";
const TOKO_NAMA = "Risol Strombreaker";
// ────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MENU = [
  { id: 1, name: "Risol Mentai Ayam", emoji: "🥐", price: 3000, desc: "Isian ayam suwir + saus mentai creamy" },
  { id: 2, name: "Risol Mentai Sosis", emoji: "🌭", price: 3000, desc: "saus mentai gurih + sosis berkualitas" },
  { id: 3, name: "Risol Mentai Daging", emoji: "🥩", price: 3000, desc: "daging sapi berkualitas + saus mentai lumer" },
  { id: 4, name: "Risol Mayo Sayur", emoji: "🥦", price: 2500, desc: "saus mayo lumer + sayuran" },
  { id: 5, name: "Risol Ayam Pedas", emoji: "🌶️", price: 3000, desc: "ayam + cabe rawit nendang!" },
  { id: 6, name: "Risol Mayo Ayam", emoji: "🍗", price: 3500, desc: "ayam + saus mayo gurih" },
  { id: 7, name: "Risol Mayo Sosis", emoji: "🌭", price: 3000, desc: "Sosis lezat + saus mayo Lumer" },
  { id: 8, name: "Risol Mayo Daging", emoji: "🥩", price: 3000, desc: "daging sapi lembut + saus mayo gurih" },
];

const PAYMENT = [
  { id: "gopay",     name: "GoPay",           color: "#00AED6", num: "0851-1304-1487", icon: "💙" },
  { id: "dana",      name: "DANA",             color: "#118EEA", num: "0851-1304-1487", icon: "💠" },
  { id: "ovo",       name: "OVO",              color: "#4C3494", num: "0851-1304-1487", icon: "💜" },
  { id: "shopeepay", name: "ShopeePay",        color: "#EE4D2D", num: "0851-1304-1487", icon: "🧡" },
  { id: "COD",       name: "Cash On Delivery", color: "#de6c02", num: "Bayar di Tempat", icon: "💵" },
];

const STATUS_LABEL = {
  pending:    { label: "⏳ Menunggu",    bg: "#FFF3CD", color: "#856404" },
  confirmed:  { label: "✅ Dikonfirmasi", bg: "#D1FAE5", color: "#065F46" },
  processing: { label: "👩‍🍳 Diproses",   bg: "#DBEAFE", color: "#1E40AF" },
  delivered:  { label: "🚀 Dikirim",     bg: "#EDE9FE", color: "#5B21B6" },
  done:       { label: "🎉 Selesai",     bg: "#D1FAE5", color: "#065F46" },
};

const fmtRp  = n => "Rp " + Number(n).toLocaleString("id-ID");
const fmtDate = s => new Date(s).toLocaleString("id-ID", { dateStyle:"medium", timeStyle:"short" });

// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage]     = useState("menu");  // menu|checkout|confirm|success|dashboard
  const [cart, setCart]     = useState({});
  const [form, setForm]     = useState({ name:"", phone:"", address:"", note:"", payment:"" });
  const [errors, setErrors] = useState({});
  const [proofFile, setProofFile]  = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [loading, setLoading]      = useState(false);
  const [orderId, setOrderId]      = useState(null);
  const [orders, setOrders]        = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [dashPin, setDashPin]      = useState("");
  const [dashUnlocked, setDashUnlocked] = useState(false);
  const DASH_PIN = "271127"; // ganti PIN dashboard

  // Cart helpers
  const addItem = (item) => setCart(c => ({ ...c, [item.id]: (c[item.id]||0)+1 }));
  const remItem = (id)   => setCart(c => { const n={...c}; n[id]>1?n[id]--:delete n[id]; return n; });
  const cartItems = Object.entries(cart).map(([id,qty]) => ({ ...MENU.find(m=>m.id===+id), qty }));
  const totalItems = cartItems.reduce((a,i)=>a+i.qty, 0);
  const totalPrice = cartItems.reduce((a,i)=>a+i.price*i.qty, 0);

  const validate = () => {
    const e = {};
    if (!form.name.trim())    e.name    = "Nama wajib diisi";
    if (!form.phone.trim())   e.phone   = "No. WhatsApp wajib diisi";
    if (!form.address.trim()) e.address = "Alamat wajib diisi";
    if (!form.payment)        e.payment = "Pilih metode pembayaran";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleProofChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
  };

  // ── SUBMIT ORDER ─────────────────────────────────────────────
  const submitOrder = async () => {
    setLoading(true);
    try {
      // 1. Upload bukti bayar ke Supabase Storage (kalau ada)
      let proofUrl = null;
      if (proofFile) {
        const ext  = proofFile.name.split(".").pop();
        const path = `bukti/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("payment-proofs").upload(path, proofFile);
        if (!upErr) {
          const { data } = supabase.storage.from("payment-proofs").getPublicUrl(path);
          proofUrl = data.publicUrl;
        }
      }

      // 2. Simpan order ke database
      const items = cartItems.map(i => ({ id:i.id, name:i.name, qty:i.qty, price:i.price }));
      const { data: newOrder, error } = await supabase.from("orders").insert([{
        customer_name:    form.name,
        customer_phone:   form.phone,
        customer_address: form.address,
        note:             form.note,
        payment_method:   form.payment,
        items:            items,
        total_price:      totalPrice,
        proof_url:        proofUrl,
        status:           "pending",
      }]).select().single();

      if (error) throw error;
      setOrderId(newOrder.id);

      setPage("success");
    } catch (err) {
      alert("Gagal kirim pesanan: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── LOAD ORDERS (Dashboard) ───────────────────────────────────
  const loadOrders = async () => {
    setLoadingOrders(true);
    const { data } = await supabase.from("orders")
      .select("*").order("created_at", { ascending:false });
    setOrders(data || []);
    setLoadingOrders(false);
  };

  const updateStatus = async (id, status) => {
    await supabase.from("orders").update({ status }).eq("id", id);
    setOrders(o => o.map(x => x.id===id ? {...x, status} : x));
  };

  useEffect(() => { if (page === "dashboard" && dashUnlocked) loadOrders(); }, [page, dashUnlocked]);

  const selectedPay = PAYMENT.find(p => p.id === form.payment);

  // ════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#FFF8EE,#FFF3E0,#FFF9F0)", fontFamily:"'Nunito',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Pacifico&display=swap');
        *{box-sizing:border-box} body{margin:0}
        .card{background:#fff;border-radius:20px;padding:20px;box-shadow:0 4px 20px rgba(244,160,58,.13);border:1.5px solid #FFE8C4;margin-bottom:16px}
        .btn{border:none;border-radius:14px;padding:13px 0;font-weight:800;font-size:15px;cursor:pointer;width:100%;transition:all .15s}
        .btn:hover{filter:brightness(1.07);transform:translateY(-1px)}
        .btn-primary{background:linear-gradient(135deg,#E67E22,#F4A03A);color:#fff;box-shadow:0 6px 20px rgba(230,126,34,.35)}
        .btn-outline{background:#FFF3E0;color:#E67E22;border:2px solid #FFD49A !important}
        .btn-green{background:linear-gradient(135deg,#27AE60,#2ECC71);color:#fff;box-shadow:0 6px 20px rgba(39,174,96,.35)}
        .inp{width:100%;padding:12px 14px;border:1.5px solid #FFD49A;border-radius:12px;font-size:14px;color:#333;background:#FFFDF8;font-family:'Nunito',sans-serif;outline:none;transition:all .15s}
        .inp:focus{border-color:#E67E22;box-shadow:0 0 0 3px rgba(230,126,34,.15)}
        .inp.err{border-color:#e74c3c}
        label span.lbl{display:block;font-size:13px;font-weight:700;color:#5D4037;margin-bottom:6px}
        .errtxt{color:#e74c3c;font-size:12px;margin-top:4px;display:block}
        .pay-opt{border-radius:14px;padding:12px 16px;cursor:pointer;transition:all .15s;border:2px solid #FFD49A;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .menu-card{background:#fff;border-radius:20px;padding:14px;border:1.5px solid #FFE8C4;box-shadow:0 4px 14px rgba(244,160,58,.1);transition:transform .18s,box-shadow .18s}
        .menu-card:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(244,160,58,.22)!important}
        .slide{animation:sl .3s cubic-bezier(.4,0,.2,1)}
        @keyframes sl{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .badge{background:#E67E22;color:#fff;border-radius:10px;padding:1px 7px;font-size:12px;font-weight:800}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#FFF3E0;color:#E67E22;font-weight:800;padding:10px 8px;text-align:left}
        td{padding:10px 8px;border-bottom:1px solid #FFE8C4;color:#4A2C0A;vertical-align:top}
        tr:hover td{background:#FFFDF8}
        select.inp{appearance:none}
      `}</style>

       {/* ── HEADER ── */}
      <header style={{ background:"linear-gradient(135deg,#E67E22,#F39C12,#F4A03A)", position:"sticky", top:0, zIndex:100, boxShadow:"0 4px 20px rgba(230,126,34,.35)" }}>
        <div style={{ maxWidth:580, margin:"0 auto", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          
          <div style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:"12px" }} onClick={() => setPage("menu")}>
            {/* Logo Lingkaran dengan Border Tipis */}
            <img 
              src="https://i.postimg.cc/sD41R2yZ/𝐒𝐓𝐑𝐎𝐌𝐁𝐑𝐄𝐀𝐊𝐄𝐑𝐒-20260507-184223.jpg" 
              alt="Logo Strombreaker" 
              style={{ 
                width: "42px", 
                height: "42px", 
                borderRadius: "50%", 
                objectFit: "cover", 
                border: "2px solid #ffffff",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }} 
            />

            <div>
              <div style={{ fontFamily:"'Pacifico',cursive", fontSize:24, color:"#fff", textShadow:"0 2px 8px rgba(0,0,0,.18)" }}>{TOKO_NAMA}</div>
              <div style={{ color:"rgba(255,255,255,.85)", fontSize:10, fontWeight:700, letterSpacing:2, textTransform:"uppercase" }}>Homemade · Enak · Murah</div>
            </div>
          </div>

          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {page==="menu" && totalItems>0 && (
              <button onClick={()=>setPage("checkout")} style={{ background:"#fff", border:"none", borderRadius:22, padding:"9px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:8, fontWeight:800, color:"#E67E22", fontSize:13, boxShadow:"0 4px 14px rgba(0,0,0,.15)" }}>
                🛒 <span className="badge">{totalItems}</span>
                <span style={{ background:"#E67E22", color:"#fff", borderRadius:10, padding:"2px 8px", fontSize:12 }}>{fmtRp(totalPrice)}</span>
              </button>
            )}
            {page!=="menu" && page!=="dashboard" && page!=="success" && (
              <button onClick={()=>setPage("menu")} style={{ background:"rgba(255,255,255,.2)", border:"none", borderRadius:18, padding:"8px 14px", cursor:"pointer", color:"#fff", fontWeight:700, fontSize:13 }}>← Menu</button>
            )}
            <button onClick={()=>setPage("dashboard")} style={{ background:"rgba(255,255,255,.18)", border:"1px solid rgba(255,255,255,.4)", borderRadius:18, padding:"8px 12px", cursor:"pointer", color:"#fff", fontWeight:700, fontSize:12 }}>⚙️ Penjual</button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth:580, margin:"0 auto", padding:"0 16px 100px" }}>

        {/* ══ MENU ══ */}
        {page==="menu" && (
          <div className="slide">
            <div style={{ textAlign:"center", padding:"22px 0 10px" }}>
              <div style={{ fontFamily:"'Pacifico',cursive", fontSize:21, color:"#E67E22" }}>Menu Hari Ini 🔥</div>
              <div style={{ color:"#A0856A", fontSize:13, marginTop:4 }}>Klik + buat tambah ke keranjang</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {MENU.map(item => (
                <div key={item.id} className="menu-card">
                  <div style={{ fontSize:42, textAlign:"center", marginBottom:8 }}>{item.emoji}</div>
                  <div style={{ fontWeight:800, fontSize:13, color:"#4A2C0A", lineHeight:1.3 }}>{item.name}</div>
                  <div style={{ fontSize:11, color:"#A0856A", margin:"4px 0 10px", lineHeight:1.4 }}>{item.desc}</div>
                  <div style={{ fontWeight:900, color:"#E67E22", fontSize:15, marginBottom:10 }}>{fmtRp(item.price)}</div>
                  {cart[item.id] ? (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#FFF3E0", borderRadius:10, padding:"4px 8px" }}>
                      <button onClick={()=>remItem(item.id)} style={{ background:"#E67E22", border:"none", borderRadius:7, width:27, height:27, color:"#fff", fontWeight:900, cursor:"pointer", fontSize:16 }}>−</button>
                      <span style={{ fontWeight:900, color:"#E67E22" }}>{cart[item.id]}</span>
                      <button onClick={()=>addItem(item)} style={{ background:"#E67E22", border:"none", borderRadius:7, width:27, height:27, color:"#fff", fontWeight:900, cursor:"pointer", fontSize:16 }}>+</button>
                    </div>
                  ) : (
                    <button onClick={()=>addItem(item)} className="btn btn-primary" style={{ fontSize:13, padding:"8px 0", borderRadius:10 }}>+ Tambah</button>
                  )}
                </div>
              ))}
            </div>
            {totalItems>0 && (
              <div className="card" style={{ marginTop:16 }}>
                <div style={{ fontWeight:800, color:"#E67E22", marginBottom:10 }}>🛒 Keranjang</div>
                {cartItems.map(i=>(
                  <div key={i.id} style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13, color:"#5D4037" }}>
                    <span>{i.emoji} {i.name} <span style={{ color:"#A0856A" }}>×{i.qty}</span></span>
                    <b style={{ color:"#E67E22" }}>{fmtRp(i.price*i.qty)}</b>
                  </div>
                ))}
                <div style={{ borderTop:"2px dashed #FFD49A", marginTop:10, paddingTop:10, display:"flex", justifyContent:"space-between", fontWeight:900, fontSize:17, color:"#E67E22" }}>
                  <span>Total</span><span>{fmtRp(totalPrice)}</span>
                </div>
                <button className="btn btn-primary" style={{ marginTop:14 }} onClick={()=>setPage("checkout")}>Lanjut Pesan →</button>
              </div>
            )}
          </div>
        )}

        {/* ══ CHECKOUT ══ */}
        {page==="checkout" && (
          <div className="slide">
            <div style={{ textAlign:"center", padding:"22px 0 8px" }}>
              <div style={{ fontFamily:"'Pacifico',cursive", fontSize:21, color:"#E67E22" }}>Data Pesanan 📝</div>
            </div>

            {/* Ringkasan */}
            <div className="card">
              <div style={{ fontWeight:800, color:"#E67E22", marginBottom:10 }}>🛒 Pesananmu</div>
              {cartItems.map(i=>(
                <div key={i.id} style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13, color:"#5D4037" }}>
                  <span>{i.emoji} {i.name} ×{i.qty}</span><b style={{ color:"#E67E22" }}>{fmtRp(i.price*i.qty)}</b>
                </div>
              ))}
              <div style={{ borderTop:"2px dashed #FFD49A", marginTop:10, paddingTop:10, display:"flex", justifyContent:"space-between", fontWeight:900, fontSize:16, color:"#E67E22" }}>
                <span>💰 Total</span><span>{fmtRp(totalPrice)}</span>
              </div>
            </div>

            {/* Form */}
            <div className="card">
              <div style={{ fontWeight:800, color:"#E67E22", marginBottom:14 }}>👤 Data Diri</div>
              {[
                { key:"name",    label:"Nama Lengkap *",       placeholder:"Budi Santoso",          type:"text"  },
                { key:"phone",   label:"No. WhatsApp *",       placeholder:"08123456789",            type:"tel"   },
                { key:"address", label:"Alamat Lengkap *",     placeholder:"Jl. Melati No. 10...",   type:"area"  },
                { key:"note",    label:"💬 Pesan untuk Penjual", placeholder:"Jangan terlalu matang...", type:"area", optional:true },
              ].map(f => (
                <label key={f.key} style={{ display:"block", marginBottom:14 }}>
                  <span className="lbl">{f.label}{f.optional && <span style={{ fontWeight:400, color:"#A0856A" }}> (opsional)</span>}</span>
                  {f.type==="area"
                    ? <textarea rows={2} className={`inp${errors[f.key]?" err":""}`} value={form[f.key]}
                        onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} />
                    : <input type={f.type} className={`inp${errors[f.key]?" err":""}`} value={form[f.key]}
                        onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} />
                  }
                  {errors[f.key] && <span className="errtxt">⚠ {errors[f.key]}</span>}
                </label>
              ))}
            </div>

            {/* Pembayaran */}
            <div className="card" style={{ border:`1.5px solid ${errors.payment?"#e74c3c":"#FFE8C4"}` }}>
              <div style={{ fontWeight:800, color:"#E67E22", marginBottom:4 }}>💳 Metode Pembayaran *</div>
              {errors.payment && <span className="errtxt" style={{ marginBottom:8 }}>⚠ {errors.payment}</span>}
              {PAYMENT.map(p=>(
                <div key={p.id} className="pay-opt"
                  style={{ border:`2px solid ${form.payment===p.id?p.color:"#FFD49A"}`, background:form.payment===p.id?p.color+"18":"#FFFDF8" }}
                  onClick={()=>setForm(f=>({...f,payment:p.id}))}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:22 }}>{p.icon}</span>
                    <div>
                      <div style={{ fontWeight:800, fontSize:13, color:form.payment===p.id?p.color:"#333" }}>{p.name}</div>
                      {form.payment===p.id && p.id !== "COD" && <div style={{ fontSize:12, color:"#666", marginTop:2 }}>📲 {p.num}</div>}
                    </div>
                  </div>
                  <div style={{ width:20, height:20, borderRadius:"50%", border:`2px solid ${form.payment===p.id?p.color:"#FFD49A"}`, background:form.payment===p.id?p.color:"transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    {form.payment===p.id && <span style={{ color:"#fff", fontSize:12 }}>✓</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Upload Bukti Bayar */}
            <div className="card">
              <div style={{ fontWeight:800, color:"#E67E22", marginBottom:4 }}>🧾 Upload Bukti Pembayaran</div>
              <div style={{ color:"#A0856A", fontSize:12, marginBottom:12 }}>Opsional, bisa dikirim nanti lewat WhatsApp (kalau diperlukan)</div>
              <label style={{ display:"block", border:"2px dashed #FFD49A", borderRadius:14, padding:20, textAlign:"center", cursor:"pointer", background:"#FFFDF8", transition:"all .15s" }}
                onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f){setProofFile(f);setProofPreview(URL.createObjectURL(f))}}}>
                <input type="file" accept="image/*" style={{ display:"none" }} onChange={handleProofChange} />
                {pro        items:            items,
        total_price:      totalPrice,
        proof_url:        proofUrl,
        status:           "pending",
      }]).select().single();

      if (error) throw error;
      setOrderId(newOrder.id);

      setPage("success");
    } catch (err) {
      alert("Gagal kirim pesanan: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── LOAD ORDERS (Dashboard) ───────────────────────────────────
  const loadOrders = async () => {
    setLoadingOrders(true);
    const { data } = await supabase.from("orders")
      .select("*").order("created_at", { ascending:false });
    setOrders(data || []);
    setLoadingOrders(false);
  };

  const updateStatus = async (id, status) => {
    await supabase.from("orders").update({ status }).eq("id", id);
    setOrders(o => o.map(x => x.id===id ? {...x, status} : x));
  };

  useEffect(() => { if (page === "dashboard" && dashUnlocked) loadOrders(); }, [page, dashUnlocked]);

  const selectedPay = PAYMENT.find(p => p.id === form.payment);

  // ════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#FFF8EE,#FFF3E0,#FFF9F0)", fontFamily:"'Nunito',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Pacifico&display=swap');
        *{box-sizing:border-box} body{margin:0}
        .card{background:#fff;border-radius:20px;padding:20px;box-shadow:0 4px 20px rgba(244,160,58,.13);border:1.5px solid #FFE8C4;margin-bottom:16px}
        .btn{border:none;border-radius:14px;padding:13px 0;font-weight:800;font-size:15px;cursor:pointer;width:100%;transition:all .15s}
        .btn:hover{filter:brightness(1.07);transform:translateY(-1px)}
        .btn-primary{background:linear-gradient(135deg,#E67E22,#F4A03A);color:#fff;box-shadow:0 6px 20px rgba(230,126,34,.35)}
        .btn-outline{background:#FFF3E0;color:#E67E22;border:2px solid #FFD49A !important}
        .btn-green{background:linear-gradient(135deg,#27AE60,#2ECC71);color:#fff;box-shadow:0 6px 20px rgba(39,174,96,.35)}
        .inp{width:100%;padding:12px 14px;border:1.5px solid #FFD49A;border-radius:12px;font-size:14px;color:#333;background:#FFFDF8;font-family:'Nunito',sans-serif;outline:none;transition:all .15s}
        .inp:focus{border-color:#E67E22;box-shadow:0 0 0 3px rgba(230,126,34,.15)}
        .inp.err{border-color:#e74c3c}
        label span.lbl{display:block;font-size:13px;font-weight:700;color:#5D4037;margin-bottom:6px}
        .errtxt{color:#e74c3c;font-size:12px;margin-top:4px;display:block}
        .pay-opt{border-radius:14px;padding:12px 16px;cursor:pointer;transition:all .15s;border:2px solid #FFD49A;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .menu-card{background:#fff;border-radius:20px;padding:14px;border:1.5px solid #FFE8C4;box-shadow:0 4px 14px rgba(244,160,58,.1);transition:transform .18s,box-shadow .18s}
        .menu-card:hover{transform:translateY(-3px);box-shadow:0 10px 28px rgba(244,160,58,.22)!important}
        .slide{animation:sl .3s cubic-bezier(.4,0,.2,1)}
        @keyframes sl{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .badge{background:#E67E22;color:#fff;border-radius:10px;padding:1px 7px;font-size:12px;font-weight:800}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#FFF3E0;color:#E67E22;font-weight:800;padding:10px 8px;text-align:left}
        td{padding:10px 8px;border-bottom:1px solid #FFE8C4;color:#4A2C0A;vertical-align:top}
        tr:hover td{background:#FFFDF8}
        select.inp{appearance:none}
      `}</style>

      {/* ── HEADER ── */}
      <header style={{ background:"linear-gradient(135deg,#E67E22,#F39C12,#F4A03A)", position:"sticky", top:0, zIndex:100, boxShadow:"0 4px 20px rgba(230,126,34,.35)" }}>
        <div style={{ maxWidth:580, margin:"0 auto", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ cursor:"pointer" }} onClick={() => setPage("menu")}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
             <img src={LOGO_SRC} alt="Logo" style={{ width: "35px", height: "35px", borderRadius: "50%", objectFit: "cover" }} />
              <div style={{ fontFamily:"'Pacifico',cursive", fontSize:24, color:"#fff", textShadow:"0 2px 8px rgba(0,0,0,.18)" }}>{TOKO_NAMA}</div>
               <div style={{ color:"rgba(255,255,255,.85)", fontSize:10, fontWeight:700, letterSpacing:2, textTransform:"uppercase" }}>Homemade · Enak · Murah</div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {page==="menu" && totalItems>0 && (
              <button onClick={()=>setPage("checkout")} style={{ background:"#fff", border:"none", borderRadius:22, padding:"9px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:8, fontWeight:800, color:"#E67E22", fontSize:13, boxShadow:"0 4px 14px rgba(0,0,0,.15)" }}>
                🛒 <span className="badge">{totalItems}</span>
                <span style={{ background:"#E67E22", color:"#fff", borderRadius:10, padding:"2px 8px", fontSize:12 }}>{fmtRp(totalPrice)}</span>
              </button>
            )}
            {page!=="menu" && page!=="dashboard" && page!=="success" && (
              <button onClick={()=>setPage("menu")} style={{ background:"rgba(255,255,255,.2)", border:"none", borderRadius:18, padding:"8px 14px", cursor:"pointer", color:"#fff", fontWeight:700, fontSize:13 }}>← Menu</button>
            )}
            <button onClick={()=>setPage("dashboard")} style={{ background:"rgba(255,255,255,.18)", border:"1px solid rgba(255,255,255,.4)", borderRadius:18, padding:"8px 12px", cursor:"pointer", color:"#fff", fontWeight:700, fontSize:12 }}>⚙️ Penjual</button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth:580, margin:"0 auto", padding:"0 16px 100px" }}>

        {/* ══ MENU ══ */}
        {page==="menu" && (
          <div className="slide">
            <div style={{ textAlign:"center", padding:"22px 0 10px" }}>
              <div style={{ fontFamily:"'Pacifico',cursive", fontSize:21, color:"#E67E22" }}>Menu Hari Ini 🔥</div>
              <div style={{ color:"#A0856A", fontSize:13, marginTop:4 }}>Klik + buat tambah ke keranjang</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {MENU.map(item => (
                <div key={item.id} className="menu-card">
                  <div style={{ fontSize:42, textAlign:"center", marginBottom:8 }}>{item.emoji}</div>
                  <div style={{ fontWeight:800, fontSize:13, color:"#4A2C0A", lineHeight:1.3 }}>{item.name}</div>
                  <div style={{ fontSize:11, color:"#A0856A", margin:"4px 0 10px", lineHeight:1.4 }}>{item.desc}</div>
                  <div style={{ fontWeight:900, color:"#E67E22", fontSize:15, marginBottom:10 }}>{fmtRp(item.price)}</div>
                  {cart[item.id] ? (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#FFF3E0", borderRadius:10, padding:"4px 8px" }}>
                      <button onClick={()=>remItem(item.id)} style={{ background:"#E67E22", border:"none", borderRadius:7, width:27, height:27, color:"#fff", fontWeight:900, cursor:"pointer", fontSize:16 }}>−</button>
                      <span style={{ fontWeight:900, color:"#E67E22" }}>{cart[item.id]}</span>
                      <button onClick={()=>addItem(item)} style={{ background:"#E67E22", border:"none", borderRadius:7, width:27, height:27, color:"#fff", fontWeight:900, cursor:"pointer", fontSize:16 }}>+</button>
                    </div>
                  ) : (
                    <button onClick={()=>addItem(item)} className="btn btn-primary" style={{ fontSize:13, padding:"8px 0", borderRadius:10 }}>+ Tambah</button>
                  )}
                </div>
              ))}
            </div>
            {totalItems>0 && (
              <div className="card" style={{ marginTop:16 }}>
                <div style={{ fontWeight:800, color:"#E67E22", marginBottom:10 }}>🛒 Keranjang</div>
                {cartItems.map(i=>(
                  <div key={i.id} style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13, color:"#5D4037" }}>
                    <span>{i.emoji} {i.name} <span style={{ color:"#A0856A" }}>×{i.qty}</span></span>
                    <b style={{ color:"#E67E22" }}>{fmtRp(i.price*i.qty)}</b>
                  </div>
                ))}
                <div style={{ borderTop:"2px dashed #FFD49A", marginTop:10, paddingTop:10, display:"flex", justifyContent:"space-between", fontWeight:900, fontSize:17, color:"#E67E22" }}>
                  <span>Total</span><span>{fmtRp(totalPrice)}</span>
                </div>
                <button className="btn btn-primary" style={{ marginTop:14 }} onClick={()=>setPage("checkout")}>Lanjut Pesan →</button>
              </div>
            )}
          </div>
        )}

        {/* ══ CHECKOUT ══ */}
        {page==="checkout" && (
          <div className="slide">
            <div style={{ textAlign:"center", padding:"22px 0 8px" }}>
              <div style={{ fontFamily:"'Pacifico',cursive", fontSize:21, color:"#E67E22" }}>Data Pesanan 📝</div>
            </div>

            {/* Ringkasan */}
            <div className="card">
              <div style={{ fontWeight:800, color:"#E67E22", marginBottom:10 }}>🛒 Pesananmu</div>
              {cartItems.map(i=>(
                <div key={i.id} style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13, color:"#5D4037" }}>
                  <span>{i.emoji} {i.name} ×{i.qty}</span><b style={{ color:"#E67E22" }}>{fmtRp(i.price*i.qty)}</b>
                </div>
              ))}
              <div style={{ borderTop:"2px dashed #FFD49A", marginTop:10, paddingTop:10, display:"flex", justifyContent:"space-between", fontWeight:900, fontSize:16, color:"#E67E22" }}>
                <span>💰 Total</span><span>{fmtRp(totalPrice)}</span>
              </div>
            </div>

            {/* Form */}
            <div className="card">
              <div style={{ fontWeight:800, color:"#E67E22", marginBottom:14 }}>👤 Data Diri</div>
              {[
                { key:"name",    label:"Nama Lengkap *",       placeholder:"Budi Santoso",          type:"text"  },
                { key:"phone",   label:"No. WhatsApp *",       placeholder:"08123456789",            type:"tel"   },
                { key:"address", label:"Alamat Lengkap *",     placeholder:"Jl. Melati No. 10...",   type:"area"  },
                { key:"note",    label:"💬 Pesan untuk Penjual", placeholder:"Jangan terlalu matang...", type:"area", optional:true },
              ].map(f => (
                <label key={f.key} style={{ display:"block", marginBottom:14 }}>
                  <span className="lbl">{f.label}{f.optional && <span style={{ fontWeight:400, color:"#A0856A" }}> (opsional)</span>}</span>
                  {f.type==="area"
                    ? <textarea rows={2} className={`inp${errors[f.key]?" err":""}`} value={form[f.key]}
                        onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} />
                    : <input type={f.type} className={`inp${errors[f.key]?" err":""}`} value={form[f.key]}
                        onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} />
                  }
                  {errors[f.key] && <span className="errtxt">⚠ {errors[f.key]}</span>}
                </label>
              ))}
            </div>

            {/* Pembayaran */}
            <div className="card" style={{ border:`1.5px solid ${errors.payment?"#e74c3c":"#FFE8C4"}` }}>
              <div style={{ fontWeight:800, color:"#E67E22", marginBottom:4 }}>💳 Metode Pembayaran *</div>
              {errors.payment && <span className="errtxt" style={{ marginBottom:8 }}>⚠ {errors.payment}</span>}
              {PAYMENT.map(p=>(
                <div key={p.id} className="pay-opt"
                  style={{ border:`2px solid ${form.payment===p.id?p.color:"#FFD49A"}`, background:form.payment===p.id?p.color+"18":"#FFFDF8" }}
                  onClick={()=>setForm(f=>({...f,payment:p.id}))}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:22 }}>{p.icon}</span>
                    <div>
                      <div style={{ fontWeight:800, fontSize:13, color:form.payment===p.id?p.color:"#333" }}>{p.name}</div>
                      {form.payment===p.id && p.id !== "COD" && <div style={{ fontSize:12, color:"#666", marginTop:2 }}>📲 {p.num}</div>}
                    </div>
                  </div>
                  <div style={{ width:20, height:20, borderRadius:"50%", border:`2px solid ${form.payment===p.id?p.color:"#FFD49A"}`, background:form.payment===p.id?p.color:"transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    {form.payment===p.id && <span style={{ color:"#fff", fontSize:12 }}>✓</span>}
                  </div>
                </div>
              ))}
            </div>

                        {/* Upload Bukti Bayar */}
            <div className="card">
              <div style={{ fontWeight:800, color:"#E67E22", marginBottom:4 }}>🧾 Upload Bukti Pembayaran</div>
              <div style={{ color:"#A0856A", fontSize:12, marginBottom:12 }}>Opsional, bisa dikirim nanti lewat WhatsApp (kalau diperlukan)</div>
              <label style={{ display:"block", border:"2px dashed #FFD49A", borderRadius:14, padding:20, textAlign:"center", cursor:"pointer", background:"#FFFDF8", transition:"all .15s" }}
                onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f){setProofFile(f);setProofPreview(URL.createObjectURL(f))}}}>
                <input type="file" accept="image/*" style={{ display:"none" }} onChange={handleProofChange} />
                {proofPreview
                  ? <img src={proofPreview} alt="bukti" style={{ maxWidth:"100%", maxHeight:200, borderRadius:10, objectFit:"contain" }} />
                  : <div><div style={{ fontSize:36 }}>📤</div><div style={{ color:"#E67E22", fontWeight:700, marginTop:8 }}>Klik atau drag foto bukti bayar</div><div style={{ fontSize:12, color:"#A0856A", marginTop:4 }}>JPG, PNG max 5MB</div></div>
                }
              </label>
              {proofPreview && <button onClick={()=>{setProofFile(null);setProofPreview(null)}} style={{ marginTop:8, background:"none", border:"none", color:"#e74c3c", cursor:"pointer", fontSize:13, fontWeight:700 }}>✕ Hapus foto</button>}
            </div>

            <button className="btn btn-primary" onClick={()=>{ if(validate()) setPage("confirm") }}>Lanjut Konfirmasi →</button>
          </div>
        )}

        {/* ══ CONFIRM ══ */}
        {page==="confirm" && (
          <div className="slide">
            <div style={{ textAlign:"center", padding:"22px 0 8px" }}>
              <div style={{ fontFamily:"'Pacifico',cursive", fontSize:21, color:"#E67E22" }}>Cek Lagi Yuk! ✅</div>
            </div>
            <div className="card">
              {[["👤 Nama",form.name],["📱 WA",form.phone],["📍 Alamat",form.address],form.note&&["💬 Pesan",form.note]].filter(Boolean).map(([l,v])=>(
                <div key={l} style={{ display:"flex", gap:8, marginBottom:10, fontSize:13 }}>
                  <span style={{ color:"#A0856A", minWidth:90 }}>{l}</span>
                  <b style={{ color:"#4A2C0A", flex:1 }}>{v}</b>
                </div>
              ))}
              <div style={{ borderTop:"2px dashed #FFD49A", margin:"12px 0" }}/>
              {cartItems.map(i=>(
                <div key={i.id} style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13, color:"#5D4037" }}>
                  <span>{i.emoji} {i.name} ×{i.qty}</span><b style={{ color:"#E67E22" }}>{fmtRp(i.price*i.qty)}</b>
                </div>
              ))}
              <div style={{ borderTop:"2px dashed #FFD49A", marginTop:10, paddingTop:10, display:"flex", justifyContent:"space-between", fontWeight:900, fontSize:17, color:"#E67E22" }}>
                <span>💰 Total</span><span>{fmtRp(totalPrice)}</span>
              </div>
              <div style={{ borderTop:"2px dashed #FFD49A", marginTop:10, paddingTop:10 }}>
                <div style={{ fontSize:13, color:"#5D4037" }}>💳 Bayar via <b style={{ color:selectedPay?.color }}>{selectedPay?.name}</b> {selectedPay?.id !== "COD" ? `— ${selectedPay?.num}` : ''}</div>
              </div>
              {proofPreview && (
                <div style={{ marginTop:12 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#5D4037", marginBottom:6 }}>🧾 Bukti Bayar:</div>
                  <img src={proofPreview} alt="bukti" style={{ maxWidth:"100%", maxHeight:160, borderRadius:10, objectFit:"contain" }} />
                </div>
              )}
            </div>
            <div style={{ display:"flex", gap:12 }}>
              <button className="btn btn-outline" style={{ flex:1 }} onClick={()=>setPage("checkout")}>← Edit</button>
              <button className="btn btn-green" style={{ flex:2 }} onClick={submitOrder} disabled={loading}>
                {loading ? "⏳ Mengirim..." : "🚀 Pesan Sekarang!"}
              </button>
            </div>
          </div>
        )}

        {/* ══ SUCCESS ══ */}
        {page==="success" && (
          <div className="slide" style={{ textAlign:"center", padding:"50px 0" }}>
            <div style={{ fontSize:80, animation:"float 3s ease-in-out infinite" }}>🎉</div>
            <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
            <div style={{ fontFamily:"'Pacifico',cursive", fontSize:26, color:"#E67E22", margin:"16px 0 8px" }}>Pesanan Masuk!</div>
            <div style={{ color:"#7D5A3C", fontSize:14, lineHeight:1.7, marginBottom:24 }}>
              Makasih <b>{form.name}</b>! 🥰<br/>
              Pesananmu sudah masuk ke sistem kami.<br/>
              Segera kami proses ya!
            </div>
            {orderId && (
              <div style={{ background:"#FFF3E0", borderRadius:14, padding:"10px 20px", marginBottom:20, display:"inline-block" }}>
                <span style={{ fontSize:13, color:"#A0856A" }}>Order ID: </span>
                <b style={{ color:"#E67E22", fontSize:14 }}>#{orderId.slice(-8).toUpperCase()}</b>
              </div>
            )}
            <br />
            <button className="btn btn-primary" onClick={()=>{ setCart({}); setForm({name:"",phone:"",address:"",note:"",payment:""}); setProofFile(null); setProofPreview(null); setPage("menu"); }} style={{ maxWidth:280, margin:"0 auto" }}>
              + Pesan Lagi
            </button>
          </div>
        )}

        {/* ══ DASHBOARD PENJUAL ══ */}
        {page==="dashboard" && (
          <div className="slide">
            <div style={{ textAlign:"center", padding:"22px 0 8px" }}>
              <div style={{ fontFamily:"'Pacifico',cursive", fontSize:21, color:"#E67E22" }}>Dashboard Penjual 📊</div>
            </div>
            {!dashUnlocked ? (
              <div className="card" style={{ textAlign:"center", padding:30 }}>
                <div style={{ fontSize:48, marginBottom:12 }}>🔐</div>
                <div style={{ fontWeight:800, color:"#4A2C0A", marginBottom:16 }}>Masukkan PIN</div>
                <input type="password" className="inp" placeholder="PIN 6 digit" maxLength={6}
                 value={dashPin} onChange={e=>setDashPin(e.target.value)}
                 style={{ textAlign:"center", fontSize:16, letterSpacing:4, maxWidth:180, margin:"0 auto 12px", display:"block" }} />
                <button className="btn btn-primary" style={{ maxWidth:180, margin:"0 auto" }}
                  onClick={()=>{ if(dashPin===DASH_PIN) setDashUnlocked(true); else alert("PIN salah!"); }}>
                  Masuk
                </button>
              </div>
            ) : (
              <>
                {/* Stats */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
                  {[
                    { label:"Total Order", val: orders.length, icon:"📦" },
                    { label:"Pending",     val: orders.filter(o=>o.status==="pending").length, icon:"⏳" },
                    { label:"Pemasukan",   val: fmtRp(orders.filter(o=>o.status==="done").reduce((a,o)=>a+o.total_price,0)), icon:"💰", small:true },
                  ].map(s=>(
                    <div key={s.label} style={{ background:"#fff", borderRadius:16, padding:"14px 10px", textAlign:"center", border:"1.5px solid #FFE8C4", boxShadow:"0 4px 14px rgba(244,160,58,.1)" }}>
                      <div style={{ fontSize:26 }}>{s.icon}</div>
                      <div style={{ fontWeight:900, color:"#E67E22", fontSize:s.small?13:20, marginTop:4 }}>{s.val}</div>
                      <div style={{ fontSize:11, color:"#A0856A" }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Order list */}
                <div className="card" style={{ overflowX:"auto" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                    <div style={{ fontWeight:800, color:"#E67E22" }}>📋 Semua Pesanan</div>
                    <button onClick={loadOrders} style={{ background:"#FFF3E0", border:"none", borderRadius:10, padding:"6px 12px", cursor:"pointer", color:"#E67E22", fontWeight:700, fontSize:12 }}>🔄 Refresh</button>
                  </div>
                  {loadingOrders ? <div style={{ textAlign:"center", padding:30, color:"#A0856A" }}>Loading...</div>
                  : orders.length===0 ? <div style={{ textAlign:"center", padding:30, color:"#A0856A" }}>Belum ada pesanan 📭</div>
                  : orders.map(o=>(
                    <div key={o.id} style={{ marginBottom:16, padding:16, background:"#FFFDF8", borderRadius:14, border:"1.5px solid #FFE8C4" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
                        <div>
                          <b style={{ color:"#4A2C0A" }}>{o.customer_name}</b>
                          <span style={{ fontSize:12, color:"#A0856A", marginLeft:8 }}>#{o.id.slice(-6).toUpperCase()}</span>
                        </div>
                        <span style={{ ...STATUS_LABEL[o.status], padding:"3px 10px", borderRadius:20, fontSize:12, fontWeight:700 }}>
                          {STATUS_LABEL[o.status]?.label}
                        </span>
                      </div>
                      <div style={{ fontSize:12, color:"#A0856A", margin:"4px 0" }}>📅 {fmtDate(o.created_at)}</div>
                      <div style={{ fontSize:12, color:"#5D4037", margin:"2px 0" }}>📍 {o.customer_address}</div>
                      <div style={{ fontSize:12, color:"#5D4037" }}>📱 {o.customer_phone} · 💳 {PAYMENT.find(p=>p.id===o.payment_method)?.name}</div>
                      {o.note && <div style={{ fontSize:12, color:"#7D5A3C", fontStyle:"italic", marginTop:4 }}>💬 "{o.note}"</div>}
                      <div style={{ marginTop:8, fontSize:13, color:"#5D4037" }}>
                        {(o.items||[]).map(i=><span key={i.id} style={{ marginRight:8 }}>{i.name} ×{i.qty}</span>)}
                      </div>
                      <div style={{ fontWeight:900, color:"#E67E22", fontSize:15, marginTop:4 }}>{fmtRp(o.total_price)}</div>
                      {o.proof_url && (
                        <div style={{ marginTop:8 }}>
                          <a href={o.proof_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:"#118EEA", fontWeight:700 }}>🧾 Lihat Bukti Bayar</a>
                        </div>
                      )}
                      {/* Update status */}
                      <div style={{ marginTop:10, display:"flex", gap:6, flexWrap:"wrap" }}>
                        {Object.entries(STATUS_LABEL).map(([k,v])=>(
                          <button key={k} onClick={()=>updateStatus(o.id,k)}
                            style={{ background: o.status===k?v.bg:"#F5F5F5", border:`1px solid ${o.status===k?v.color:"#ddd"}`, borderRadius:10, padding:"4px 10px", cursor:"pointer", fontSize:12, fontWeight:700, color: o.status===k?v.color:"#888" }}>
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
            
