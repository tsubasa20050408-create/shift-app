import { useState, useCallback } from "react";
import * as XLSX from "xlsx";

// ─── 初期データ ───────────────────────────────────────────
const DOW = ['月','火','水','木','金','土','日'];

const INITIAL_GROUPS = {
  third:  ['日下部','須藤','松崎','新行内','中林','渡邊','高杉'],
  second: ['常山','元橋','金子','大塚','増田','柴田','浦澤','栗山'],
  first:  ['落合','栗林','杉山','水平','岡','土井','村上','物部','堀','兼杉','作島','吉越','田代'],
};

const dowSet = (list) => {
  const m = {月:0,火:1,水:2,木:3,金:4,土:5,日:6};
  return new Set(list.map(d => m[d]));
};

const INITIAL_NG = {
  '日下部': { mDow:new Set(), mDate:new Set([1,2]), eDow:dowSet(['月','火','水','金']), eDate:new Set(), aDow:new Set(), aDate:new Set() },
  '須藤':   { mDow:dowSet(['水','土']), mDate:new Set(), eDow:dowSet(['水','金']), eDate:new Set(), aDow:new Set(), aDate:new Set() },
  '松崎':   { mDow:dowSet(['土']), mDate:new Set(), eDow:dowSet(['火','水','日']), eDate:new Set(), aDow:new Set(), aDate:new Set([1,12,13,29]) },
  '新行内': { mDow:dowSet(['火']), mDate:new Set(), eDow:dowSet(['水','木']), eDate:new Set([1,2,3,4,5,6]), aDow:dowSet(['金','土']), aDate:new Set() },
  '増田':   { mDow:new Set(), mDate:new Set(), eDow:dowSet(['月','火','水','木','金']), eDate:new Set(), aDow:new Set(), aDate:new Set([28,29]) },
  '金子':   { mDow:new Set(), mDate:new Set(), eDow:dowSet(['月','火','水','木','金']), eDate:new Set(), aDow:new Set(), aDate:new Set() },
  '高杉':   { mDow:new Set(), mDate:new Set(), eDow:dowSet(['月','火','水','金']), eDate:new Set([5,19]), aDow:new Set(), aDate:new Set([1,2,3]) },
  '栗山':   { mDow:dowSet(['月','土']), mDate:new Set(), eDow:dowSet(['月','火','水','木','金']), eDate:new Set(), aDow:new Set(), aDate:new Set() },
  '浦澤':   { mDow:new Set(), mDate:new Set(), eDow:dowSet(['月','火','水']), eDate:new Set(), aDow:new Set(), aDate:new Set() },
  '常山':   { mDow:new Set(), mDate:new Set(), eDow:dowSet(['月','火','水']), eDate:new Set(), aDow:new Set(), aDate:new Set() },
  '中林':   { mDow:dowSet(['月','金','土']), mDate:new Set(), eDow:dowSet(['月','木','金']), eDate:new Set(), aDow:new Set(), aDate:new Set() },
  '大塚':   { mDow:new Set(), mDate:new Set(), eDow:dowSet(['月','火','水','木','金']), eDate:new Set(), aDow:new Set(), aDate:new Set([3,4]) },
  '元橋':   { mDow:new Set(), mDate:new Set(), eDow:dowSet(['月','火','水']), eDate:new Set(), aDow:new Set(), aDate:new Set() },
  '柴田':   { mDow:new Set(), mDate:new Set(), eDow:dowSet(['月','火','水','木','金']), eDate:new Set(), aDow:dowSet(['土']), aDate:new Set() },
  '渡邊':   { mDow:dowSet(['日']), mDate:new Set(), eDow:dowSet(['火','水','木','土','日']), eDate:new Set(), aDow:new Set(), aDate:new Set() },
};
const emptyNg = () => ({ mDow:new Set(), mDate:new Set(), eDow:new Set(), eDate:new Set(), aDow:new Set(), aDate:new Set() });
[...INITIAL_GROUPS.first].forEach(n => { INITIAL_NG[n] = emptyNg(); });

const EVENING_WORK_NEED = {0:3,1:2,2:3,3:3,4:2,5:0,6:5};

// ─── シフト生成 ────────────────────────────────────────────
function generateShift({ year, month, groups, ng, settings }) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const cal = {};
  for (let d = 1; d <= daysInMonth; d++) {
    cal[d] = new Date(year, month - 1, d).getDay();
    cal[d] = cal[d] === 0 ? 6 : cal[d] - 1; // 0=月..6=日
  }

  const allStaff = [...groups.third, ...groups.second, ...groups.first];
  const thirdSet = new Set(groups.third);
  const secondSet = new Set(groups.second);
  const firstSet = new Set(groups.first);

  const canMorning = (name, date, dow) => {
    const n = ng[name] || emptyNg();
    if (n.aDate.has(date) || n.aDow.has(dow)) return false;
    if (n.mDow.has(dow) || n.mDate.has(date)) return false;
    return true;
  };
  const canEvening = (name, date, dow) => {
    const n = ng[name] || emptyNg();
    if (n.aDate.has(date) || n.aDow.has(dow)) return false;
    if (n.eDow.has(dow) || n.eDate.has(date)) return false;
    return true;
  };

  const rand = () => Math.random();

  // Step1: 夕作業
  const eveningPossible = {};
  allStaff.forEach(s => {
    eveningPossible[s] = Array.from({length:daysInMonth},(_,i)=>i+1).filter(d=>canEvening(s,d,cal[d])).length;
  });
  const eAssign = {};
  const eCnt = Object.fromEntries(allStaff.map(s=>[s,0]));
  const eveningDays = Array.from({length:daysInMonth},(_,i)=>i+1)
    .filter(d=>EVENING_WORK_NEED[cal[d]]>0)
    .sort((a,b)=>allStaff.filter(s=>canEvening(s,a,cal[a])).length - allStaff.filter(s=>canEvening(s,b,cal[b])).length);
  eveningDays.forEach(d=>{
    const need = EVENING_WORK_NEED[cal[d]];
    const avail = allStaff.filter(s=>canEvening(s,d,cal[d])).sort((a,b)=>eCnt[a]-eCnt[b]||eveningPossible[a]-eveningPossible[b]||rand()-0.5);
    eAssign[d] = avail.slice(0,need);
    eAssign[d].forEach(s=>eCnt[s]++);
  });
  for(let d=1;d<=daysInMonth;d++) if(!eAssign[d]) eAssign[d]=[];

  // Step2: 朝運動
  const meAssign = {};
  const meCnt = Object.fromEntries(allStaff.map(s=>[s,0]));
  const totCnt = Object.fromEntries(allStaff.map(s=>[s,eCnt[s]]));
  const meTotal = settings.morningExerciseCount;
  const rule = settings.morningExerciseRule;

  for(let d=1;d<=daysInMonth;d++){
    const dow = cal[d];
    const avail = allStaff.filter(s=>canMorning(s,d,dow));
    let chosen = [];
    if(rule === 'senior_junior'){
      const seniors = avail.filter(s=>thirdSet.has(s)||secondSet.has(s)).sort((a,b)=>meCnt[a]-meCnt[b]||totCnt[a]-totCnt[b]||rand()-0.5);
      const juniors = avail.filter(s=>firstSet.has(s)).sort((a,b)=>meCnt[a]-meCnt[b]||totCnt[a]-totCnt[b]||rand()-0.5);
      if(seniors.length) chosen.push(seniors[0]);
      if(juniors.length) chosen.push(juniors[0]);
      if(chosen.length < meTotal){
        const rest = avail.filter(s=>!chosen.includes(s)).sort((a,b)=>meCnt[a]-meCnt[b]||rand()-0.5);
        chosen = [...chosen, ...rest.slice(0, meTotal - chosen.length)];
      }
    } else {
      chosen = avail.sort((a,b)=>meCnt[a]-meCnt[b]||totCnt[a]-totCnt[b]||rand()-0.5).slice(0,meTotal);
    }
    meAssign[d] = chosen;
    chosen.forEach(s=>{ meCnt[s]++; totCnt[s]++; });
  }

  // Step3: 朝作業（学年別人数）
  const mwAssign = {};
  const mwCnt = Object.fromEntries(allStaff.map(s=>[s,0]));
  const quota = settings.morningWorkByGrade;

  for(let d=1;d<=daysInMonth;d++){
    const dow = cal[d];
    const meSet = new Set(meAssign[d]);
    const avail = s => canMorning(s,d,dow) && !meSet.has(s);

    const thirds  = allStaff.filter(s=>thirdSet.has(s) &&avail(s)).sort((a,b)=>mwCnt[a]-mwCnt[b]||totCnt[a]-totCnt[b]||rand()-0.5);
    const seconds = allStaff.filter(s=>secondSet.has(s)&&avail(s)).sort((a,b)=>mwCnt[a]-mwCnt[b]||totCnt[a]-totCnt[b]||rand()-0.5);
    const firsts  = allStaff.filter(s=>firstSet.has(s) &&avail(s)).sort((a,b)=>mwCnt[a]-mwCnt[b]||totCnt[a]-totCnt[b]||rand()-0.5);

    const chosen = [
      ...thirds.slice(0, quota.third),
      ...seconds.slice(0, quota.second),
      ...firsts.slice(0, quota.first),
    ];
    mwAssign[d] = chosen;
    chosen.forEach(s=>{ mwCnt[s]++; totCnt[s]++; });
  }

  const stats = {};
  allStaff.forEach(s=>{ stats[s]={ mw:mwCnt[s], me:meCnt[s], ew:eCnt[s], total:mwCnt[s]+meCnt[s]+eCnt[s] }; });

  return { cal, daysInMonth, mwAssign, meAssign, eAssign, stats, thirdSet, secondSet, firstSet };
}

// ─── Excel出力 ────────────────────────────────────────────
function exportToExcel(result, allStaff, year, month) {
  const wb = XLSX.utils.book_new();

  // シフトシート
  const shiftRows = [['日付', '曜日', '朝作業', '朝運動', '夕作業']];
  for (let d = 1; d <= result.daysInMonth; d++) {
    shiftRows.push([
      `${month}/${d}`,
      DOW[result.cal[d]],
      (result.mwAssign[d] || []).join('・'),
      (result.meAssign[d] || []).join('・'),
      (result.eAssign[d]  || []).join('・'),
    ]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(shiftRows);
  ws1['!cols'] = [{ wch:8 }, { wch:5 }, { wch:35 }, { wch:20 }, { wch:25 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'シフト');

  // 集計シート
  const statsRows = [['名前', '学年', '朝作業', '朝運動', '夕作業', '合計']];
  allStaff.forEach(s => {
    const grade = gradeOf(s, result.thirdSet, result.secondSet, result.firstSet);
    const st = result.stats[s];
    statsRows.push([s, grade, st.mw, st.me, st.ew, st.total]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(statsRows);
  ws2['!cols'] = [{ wch:10 }, { wch:6 }, { wch:8 }, { wch:8 }, { wch:8 }, { wch:8 }];
  XLSX.utils.book_append_sheet(wb, ws2, '集計');

  XLSX.writeFile(wb, `shift_${year}_${String(month).padStart(2,'0')}.xlsx`);
}

// ─── グレードラベル ─────────────────────────────────────────
function gradeOf(name, thirdSet, secondSet, firstSet){
  if(thirdSet.has(name)) return '3年';
  if(secondSet.has(name)) return '2年';
  return '1年';
}

// ─── コンポーネント ────────────────────────────────────────
const GRADE_COLOR = { '3年':'#c084fc', '2年':'#60a5fa', '1年':'#34d399' };

export default function ShiftApp() {
  const [tab, setTab] = useState('shift');
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(4);
  const [groups, setGroups] = useState(INITIAL_GROUPS);
  const [ng, setNg] = useState(INITIAL_NG);
  const [settings, setSettings] = useState({
    morningExerciseRule: 'senior_junior',
    morningExerciseCount: 2,
    morningWorkByGrade: { third: 1, second: 1, first: 3 },
  });
  const [result, setResult] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [ngEditMode, setNgEditMode] = useState('dow');

  const allStaff = [...groups.third, ...groups.second, ...groups.first];

  const handleGenerate = useCallback(() => {
    const r = generateShift({ year, month, groups, ng, settings });
    setResult(r);
    setTab('shift');
  }, [year, month, groups, ng, settings]);

  const handleExport = useCallback(() => {
    if (!result) return;
    exportToExcel(result, allStaff, year, month);
  }, [result, allStaff, year, month]);

  const toggleNgDow = (name, type, dow) => {
    setNg(prev => {
      const cur = prev[name] || emptyNg();
      const key = type === 'morning' ? 'mDow' : type === 'evening' ? 'eDow' : 'aDow';
      const next = new Set(cur[key]);
      next.has(dow) ? next.delete(dow) : next.add(dow);
      return { ...prev, [name]: { ...cur, [key]: next } };
    });
  };

  const toggleNgDate = (name, type, date) => {
    setNg(prev => {
      const cur = prev[name] || emptyNg();
      const key = type === 'morning' ? 'mDate' : type === 'evening' ? 'eDate' : 'aDate';
      const next = new Set(cur[key]);
      next.has(date) ? next.delete(date) : next.add(date);
      return { ...prev, [name]: { ...cur, [key]: next } };
    });
  };

  const setMwGrade = (grade, val) =>
    setSettings(s => ({ ...s, morningWorkByGrade: { ...s.morningWorkByGrade, [grade]: Math.max(0, +val) } }));

  const daysInMonth = new Date(year, month, 0).getDate();

  return (
    <div style={{ fontFamily:"'Noto Sans JP', sans-serif", background:'#0f1117', minHeight:'100vh', color:'#e2e8f0' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1e293b,#0f172a)', borderBottom:'1px solid #1e293b', padding:'16px 20px', display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.5px', color:'#f8fafc' }}>🐴 シフト管理</div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          {[['shift','📅 シフト'],['ng','⛔ NG設定'],['settings','⚙️ 設定']].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)} style={{
              padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
              background: tab===key ? '#6366f1' : '#1e293b',
              color: tab===key ? '#fff' : '#94a3b8',
              transition:'all 0.15s'
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:20, maxWidth:1000, margin:'0 auto' }}>

        {/* ─── シフトタブ ─── */}
        {tab==='shift' && (
          <div>
            <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input type="number" value={year} onChange={e=>setYear(+e.target.value)} style={inputStyle} />
                <span style={{color:'#94a3b8'}}>年</span>
                <input type="number" min={1} max={12} value={month} onChange={e=>setMonth(+e.target.value)} style={{...inputStyle, width:60}} />
                <span style={{color:'#94a3b8'}}>月</span>
              </div>
              <button onClick={handleGenerate} style={{
                padding:'8px 24px', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', border:'none',
                borderRadius:10, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer',
                boxShadow:'0 4px 15px rgba(99,102,241,0.4)', letterSpacing:'0.3px'
              }}>🎲 シフト生成</button>
              {result && (
                <>
                  <span style={{color:'#34d399',fontSize:13}}>✓ 生成済み ({year}/{month})</span>
                  <button onClick={handleExport} style={{
                    padding:'8px 18px', background:'linear-gradient(135deg,#059669,#047857)', border:'none',
                    borderRadius:10, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer',
                    boxShadow:'0 4px 15px rgba(5,150,105,0.35)', letterSpacing:'0.3px'
                  }}>📥 Excel出力</button>
                </>
              )}
            </div>

            {!result && (
              <div style={{ textAlign:'center', padding:'60px 0', color:'#475569' }}>
                <div style={{fontSize:48,marginBottom:12}}>🐎</div>
                <div style={{fontSize:16}}>「シフト生成」ボタンで作成開始</div>
              </div>
            )}

            {result && (
              <div>
                {/* 個人別集計 */}
                <div style={{ background:'#1e293b', borderRadius:12, padding:16, marginBottom:20, overflowX:'auto' }}>
                  <div style={{ fontWeight:700, marginBottom:12, fontSize:14, color:'#94a3b8' }}>個人別集計</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{color:'#64748b'}}>
                        {['名前','学年','朝作業','朝運動','夕作業','合計'].map(h=>(
                          <th key={h} style={{padding:'4px 10px',textAlign:'center',fontWeight:600}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allStaff.map(s=>{
                        const grade = gradeOf(s, result.thirdSet, result.secondSet, result.firstSet);
                        const st = result.stats[s];
                        return (
                          <tr key={s} style={{borderTop:'1px solid #0f1117'}}>
                            <td style={{padding:'5px 10px', fontWeight:600}}>{s}</td>
                            <td style={{padding:'5px 10px', textAlign:'center'}}>
                              <span style={{ background:GRADE_COLOR[grade]+'22', color:GRADE_COLOR[grade], borderRadius:5, padding:'2px 8px', fontSize:11 }}>{grade}</span>
                            </td>
                            {[st.mw, st.me, st.ew, st.total].map((v,i)=>(
                              <td key={i} style={{padding:'5px 10px', textAlign:'center', color: i===3?'#f8fafc':'#cbd5e1', fontWeight:i===3?700:400}}>{v}</td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 日別シフト */}
                <div style={{ display:'grid', gap:10 }}>
                  {Array.from({length:result.daysInMonth},(_,i)=>i+1).map(d=>{
                    const dow = result.cal[d];
                    const mw = result.mwAssign[d]||[];
                    const me = result.meAssign[d]||[];
                    const ew = result.eAssign[d]||[];
                    const isSat = dow===5, isSun = dow===6;
                    return (
                      <div key={d} style={{
                        background:'#1e293b', borderRadius:10, padding:'12px 16px',
                        borderLeft:`3px solid ${isSun?'#f87171':isSat?'#60a5fa':'#334155'}`,
                        display:'grid', gridTemplateColumns:'50px 1fr 1fr 1fr', gap:12, alignItems:'start'
                      }}>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontWeight:800, fontSize:18, color: isSun?'#f87171':isSat?'#60a5fa':'#f8fafc' }}>{d}</div>
                          <div style={{ fontSize:12, color:'#64748b' }}>{DOW[dow]}</div>
                        </div>
                        {[['朝作業',mw,'#fbbf24'],['朝運動',me,'#34d399'],['夕作業',ew,'#818cf8']].map(([label,members,color])=>(
                          <div key={label}>
                            <div style={{fontSize:11,color:color,fontWeight:600,marginBottom:4}}>{label}</div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                              {members.length===0
                                ? <span style={{color:'#334155',fontSize:12}}>ー</span>
                                : members.map(s=>{
                                    const grade = gradeOf(s, result.thirdSet, result.secondSet, result.firstSet);
                                    return (
                                      <span key={s} style={{
                                        background:GRADE_COLOR[grade]+'22', color:GRADE_COLOR[grade],
                                        borderRadius:5, padding:'2px 7px', fontSize:12, fontWeight:500
                                      }}>{s}</span>
                                    );
                                  })
                              }
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── NG設定タブ ─── */}
        {tab==='ng' && (
          <div>
            <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
              {allStaff.map(s=>{
                const grade = gradeOf(s, new Set(groups.third), new Set(groups.second), new Set(groups.first));
                return (
                  <button key={s} onClick={()=>setSelectedStaff(s)} style={{
                    padding:'5px 12px', borderRadius:8, border:`1px solid ${selectedStaff===s?GRADE_COLOR[grade]:'#334155'}`,
                    background: selectedStaff===s ? GRADE_COLOR[grade]+'33' : '#1e293b',
                    color: GRADE_COLOR[grade], cursor:'pointer', fontSize:13, fontWeight:selectedStaff===s?700:400
                  }}>{s}</button>
                );
              })}
            </div>

            {selectedStaff && (
              <div style={{ background:'#1e293b', borderRadius:12, padding:20 }}>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:16 }}>
                  {selectedStaff} のNG設定
                </div>

                <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                  {[['dow','曜日NG'],['date','日付NG']].map(([k,l])=>(
                    <button key={k} onClick={()=>setNgEditMode(k)} style={{
                      padding:'5px 14px', borderRadius:7, border:'none', cursor:'pointer',
                      background: ngEditMode===k?'#6366f1':'#0f1117', color: ngEditMode===k?'#fff':'#64748b', fontSize:13
                    }}>{l}</button>
                  ))}
                </div>

                {ngEditMode==='dow' && (
                  <div style={{ display:'grid', gap:12 }}>
                    {[['morning','朝NG (朝作業・朝運動)','#fbbf24'],['evening','夕NG','#818cf8'],['allday','終日NG','#f87171']].map(([type,label,color])=>(
                      <div key={type}>
                        <div style={{fontSize:13,color:color,fontWeight:600,marginBottom:8}}>{label}</div>
                        <div style={{display:'flex',gap:6}}>
                          {DOW.map((d,i)=>{
                            const key = type==='morning'?'mDow':type==='evening'?'eDow':'aDow';
                            const active = (ng[selectedStaff]||emptyNg())[key].has(i);
                            return (
                              <button key={d} onClick={()=>toggleNgDow(selectedStaff,type,i)} style={{
                                width:40, height:40, borderRadius:8, border:'none', cursor:'pointer',
                                background: active ? color+'44' : '#0f1117',
                                color: active ? color : '#475569',
                                fontWeight: active?700:400, fontSize:13,
                                outline: active ? `2px solid ${color}` : 'none'
                              }}>{d}</button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {ngEditMode==='date' && (
                  <div style={{ display:'grid', gap:12 }}>
                    {[['morning','朝NG','#fbbf24'],['evening','夕NG','#818cf8'],['allday','終日NG','#f87171']].map(([type,label,color])=>(
                      <div key={type}>
                        <div style={{fontSize:13,color:color,fontWeight:600,marginBottom:8}}>{label}</div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                          {Array.from({length:daysInMonth},(_,i)=>i+1).map(d=>{
                            const key = type==='morning'?'mDate':type==='evening'?'eDate':'aDate';
                            const active = (ng[selectedStaff]||emptyNg())[key].has(d);
                            return (
                              <button key={d} onClick={()=>toggleNgDate(selectedStaff,type,d)} style={{
                                width:36, height:36, borderRadius:7, border:'none', cursor:'pointer',
                                background: active ? color+'44' : '#0f1117',
                                color: active ? color : '#475569',
                                fontWeight: active?700:400, fontSize:12,
                                outline: active ? `2px solid ${color}` : 'none'
                              }}>{d}</button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={()=>{ setNg(prev=>({ ...prev, [selectedStaff]: emptyNg() })); }} style={{
                  marginTop:20, padding:'6px 16px', background:'#7f1d1d', border:'none',
                  borderRadius:7, color:'#fca5a5', cursor:'pointer', fontSize:13
                }}>このスタッフのNG全クリア</button>
              </div>
            )}
            {!selectedStaff && (
              <div style={{color:'#475569',textAlign:'center',padding:'40px 0'}}>
                上のスタッフ名を選択してNG条件を編集
              </div>
            )}
          </div>
        )}

        {/* ─── 設定タブ ─── */}
        {tab==='settings' && (
          <div style={{ display:'grid', gap:16 }}>

            {/* 朝作業 学年別人数 */}
            <div style={{ background:'#1e293b', borderRadius:12, padding:20 }}>
              <div style={{ fontWeight:700, marginBottom:4 }}>朝作業の学年別人数</div>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:14 }}>
                合計 {settings.morningWorkByGrade.third + settings.morningWorkByGrade.second + settings.morningWorkByGrade.first} 名 / 日
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  ['third',  '3年', '#c084fc'],
                  ['second', '2年', '#60a5fa'],
                  ['first',  '1年', '#34d399'],
                ].map(([key, label, color]) => (
                  <div key={key} style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{
                      background: color+'22', color, borderRadius:6,
                      padding:'2px 10px', fontSize:13, fontWeight:600, width:44, textAlign:'center'
                    }}>{label}</span>
                    <input
                      type="number" min={0} max={10}
                      value={settings.morningWorkByGrade[key]}
                      onChange={e => setMwGrade(key, e.target.value)}
                      style={{...inputStyle, width:60}}
                    />
                    <span style={{color:'#94a3b8', fontSize:13}}>名</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 朝運動ルール */}
            <div style={{ background:'#1e293b', borderRadius:12, padding:20 }}>
              <div style={{ fontWeight:700, marginBottom:12 }}>朝運動のペアルール</div>
              {[
                ['senior_junior','上級生(3年 or 2年)1名 + 1年生1名'],
                ['any','条件なし（出勤回数の少ない順）'],
              ].map(([val,label])=>(
                <label key={val} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, cursor:'pointer' }}>
                  <input type="radio" checked={settings.morningExerciseRule===val}
                    onChange={()=>setSettings(s=>({...s,morningExerciseRule:val}))} />
                  <span style={{fontSize:14}}>{label}</span>
                </label>
              ))}
            </div>

            {/* 朝運動人数 */}
            <div style={{ background:'#1e293b', borderRadius:12, padding:20 }}>
              <div style={{ fontWeight:700, marginBottom:12 }}>朝運動の人数</div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <input type="number" min={1} max={5} value={settings.morningExerciseCount}
                  onChange={e=>setSettings(s=>({...s,morningExerciseCount:+e.target.value}))}
                  style={{...inputStyle, width:70}} />
                <span style={{color:'#94a3b8'}}>名</span>
              </div>
            </div>

            {/* スタッフ確認 */}
            <div style={{ background:'#1e293b', borderRadius:12, padding:20 }}>
              <div style={{ fontWeight:700, marginBottom:12 }}>スタッフ一覧</div>
              {[['third','3年',groups.third],['second','2年',groups.second],['first','1年',groups.first]].map(([key,label,members])=>(
                <div key={key} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:13, color:GRADE_COLOR[label], fontWeight:600, marginBottom:6 }}>{label}生 ({members.length}名)</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                    {members.map(s=>(
                      <span key={s} style={{
                        background:GRADE_COLOR[label]+'22', color:GRADE_COLOR[label],
                        borderRadius:5, padding:'2px 8px', fontSize:12
                      }}>{s}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  background:'#1e293b', border:'1px solid #334155', borderRadius:8,
  color:'#f8fafc', padding:'6px 12px', fontSize:14, width:80, outline:'none'
};
