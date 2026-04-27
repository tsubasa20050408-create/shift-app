import { useState, useCallback } from "react";
import * as XLSX from "xlsx";

const DOW = ['月','火','水','木','金','土','日'];
const GRADE_COLOR = { '3年':'#c084fc', '2年':'#60a5fa', '1年':'#34d399' };
const EVENING_WORK_NEED = {0:3,1:2,2:3,3:3,4:2,5:0,6:5};

const inputStyle = {
  background:'#0f1117', border:'1px solid #334155', borderRadius:8,
  color:'#f8fafc', padding:'6px 12px', fontSize:14, outline:'none',
};

const INITIAL_GROUPS = {
  third:  ['日下部','須藤','松崎','新行内','中林','渡邊','高杉'],
  second: ['常山','元橋','金子','大塚','増田','柴田','浦澤','栗山'],
  first:  ['落合','栗林','杉山','水平','岡','土井','村上','物部','堀','兼杉','作島','吉越','田代'],
};

const dowSet = (list) => {
  const m = {月:0,火:1,水:2,木:3,金:4,土:5,日:6};
  return new Set(list.map(d => m[d]));
};

const emptyNg = () => ({
  mDow:new Set(), mDate:new Set(),
  eDow:new Set(), eDate:new Set(),
  aDow:new Set(), aDate:new Set(),
});

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
[...INITIAL_GROUPS.first].forEach(n => { INITIAL_NG[n] = emptyNg(); });

const INITIAL_SETTINGS = {
  morningExerciseRule: 'senior_junior',
  morningExerciseCount: 2,
  morningWorkPatterns: [
    { id: 1, label: 'パターン1', senior: 2, junior: 3 },
  ],
  eveningWorkPatterns: [
    { id: 1, label: 'パターン1', senior: 1, junior: 2 },
  ],
  nextPatternId: 2,
};

// ─── ユーティリティ ──────────────────────────────────────────
function gradeOf(name, thirdSet, secondSet) {
  if (thirdSet.has(name)) return '3年';
  if (secondSet.has(name)) return '2年';
  return '1年';
}

// ─── シフト生成 ──────────────────────────────────────────────
function generateShift({ year, month, groups, ng, settings }) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const cal = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const raw = new Date(year, month - 1, d).getDay();
    cal[d] = raw === 0 ? 6 : raw - 1;
  }

  const allStaff = [...groups.third, ...groups.second, ...groups.first];
  const thirdSet = new Set(groups.third);
  const secondSet = new Set(groups.second);
  const isSenior = s => thirdSet.has(s) || secondSet.has(s);

  const canMorning = (name, d, dow) => {
    const n = ng[name] || emptyNg();
    return !n.aDate.has(d) && !n.aDow.has(dow) && !n.mDow.has(dow) && !n.mDate.has(d);
  };
  const canEvening = (name, d, dow) => {
    const n = ng[name] || emptyNg();
    return !n.aDate.has(d) && !n.aDow.has(dow) && !n.eDow.has(dow) && !n.eDate.has(d);
  };

  // 連勤追跡: 朝・夕どちらも同日扱い
  const workedDays = Object.fromEntries(allStaff.map(s => [s, new Set()]));
  const markWorked = (names, d) => names.forEach(s => workedDays[s].add(d));

  // d-1から何日連続か
  const consecBefore = (name, d) => {
    let cnt = 0, x = d - 1;
    while (x >= 1 && workedDays[name].has(x)) { cnt++; x--; }
    return cnt;
  };

  // 連勤ペナルティ付きソート（3連勤はブロック）
  const sortCands = (cands, d, cntA, cntB) =>
    cands
      .filter(s => consecBefore(s, d) < 2)
      .sort((a, b) => {
        const diff = consecBefore(a, d) - consecBefore(b, d);
        if (diff) return diff;
        return cntA[a] - cntA[b] || cntB[a] - cntB[b] || Math.random() - 0.5;
      });

  const pickRnd = arr => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;

  const eCnt = {}, meCnt = {}, mwCnt = {}, totCnt = {};
  allStaff.forEach(s => { eCnt[s] = meCnt[s] = mwCnt[s] = totCnt[s] = 0; });

  const eAssign = {}, meAssign = {}, mwAssign = {};

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = cal[d];

    // ── 夕作業 ──
    const eNeed = EVENING_WORK_NEED[dow];
    if (eNeed > 0) {
      const ePat = pickRnd(settings.eveningWorkPatterns) || { senior: 1, junior: 2 };
      const eAvail = sortCands(allStaff.filter(s => canEvening(s, d, dow)), d, eCnt, totCnt);
      const eSen = eAvail.filter(isSenior);
      const eJun = eAvail.filter(s => !isSenior(s));
      let eChosen = [...eSen.slice(0, ePat.senior), ...eJun.slice(0, ePat.junior)];
      // 不足分を埋める（連勤ブロックされていない残員から）
      if (eChosen.length < eNeed) {
        const rest = eAvail.filter(s => !eChosen.includes(s));
        eChosen = [...eChosen, ...rest.slice(0, eNeed - eChosen.length)];
      }
      eChosen = eChosen.slice(0, eNeed);
      eAssign[d] = eChosen;
      eChosen.forEach(s => { eCnt[s]++; totCnt[s]++; });
      markWorked(eChosen, d);
    } else {
      eAssign[d] = [];
    }

    // ── 朝運動 ──
    const meAvail = sortCands(allStaff.filter(s => canMorning(s, d, dow)), d, meCnt, totCnt);
    let meChosen = [];
    if (settings.morningExerciseRule === 'senior_junior') {
      const mes = meAvail.filter(isSenior);
      const mej = meAvail.filter(s => !isSenior(s));
      if (mes.length) meChosen.push(mes[0]);
      if (mej.length) meChosen.push(mej[0]);
      if (meChosen.length < settings.morningExerciseCount) {
        const rest = meAvail.filter(s => !meChosen.includes(s));
        meChosen = [...meChosen, ...rest.slice(0, settings.morningExerciseCount - meChosen.length)];
      }
    } else {
      meChosen = meAvail.slice(0, settings.morningExerciseCount);
    }
    meAssign[d] = meChosen;
    meChosen.forEach(s => { meCnt[s]++; totCnt[s]++; });
    markWorked(meChosen, d);

    // ── 朝作業 ──
    const meSet = new Set(meChosen);
    const mwPat = pickRnd(settings.morningWorkPatterns) || { senior: 2, junior: 3 };
    const mwAvail = sortCands(
      allStaff.filter(s => canMorning(s, d, dow) && !meSet.has(s)),
      d, mwCnt, totCnt
    );
    const mwSen = mwAvail.filter(isSenior);
    const mwJun = mwAvail.filter(s => !isSenior(s));
    const mwChosen = [...mwSen.slice(0, mwPat.senior), ...mwJun.slice(0, mwPat.junior)];
    mwAssign[d] = mwChosen;
    mwChosen.forEach(s => { mwCnt[s]++; totCnt[s]++; });
    markWorked(mwChosen, d);
  }

  const stats = {};
  allStaff.forEach(s => { stats[s] = { mw: mwCnt[s], me: meCnt[s], ew: eCnt[s], total: totCnt[s] }; });

  return { cal, daysInMonth, mwAssign, meAssign, eAssign, stats, thirdSet, secondSet };
}

// ─── Excel出力 ───────────────────────────────────────────────
function exportToExcel(result, allStaff, year, month) {
  const wb = XLSX.utils.book_new();

  const shiftRows = [['日付','曜日','朝作業','朝運動','夕作業']];
  for (let d = 1; d <= result.daysInMonth; d++) {
    shiftRows.push([
      `${month}/${d}`,
      DOW[result.cal[d]],
      (result.mwAssign[d]||[]).join('・'),
      (result.meAssign[d]||[]).join('・'),
      (result.eAssign[d] ||[]).join('・'),
    ]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(shiftRows);
  ws1['!cols'] = [{wch:8},{wch:5},{wch:35},{wch:20},{wch:25}];
  XLSX.utils.book_append_sheet(wb, ws1, 'シフト');

  const statsRows = [['名前','学年','朝作業','朝運動','夕作業','合計']];
  allStaff.forEach(s => {
    const grade = gradeOf(s, result.thirdSet, result.secondSet);
    const st = result.stats[s];
    statsRows.push([s, grade, st.mw, st.me, st.ew, st.total]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(statsRows);
  ws2['!cols'] = [{wch:10},{wch:6},{wch:8},{wch:8},{wch:8},{wch:8}];
  XLSX.utils.book_append_sheet(wb, ws2, '集計');

  XLSX.writeFile(wb, `shift_${year}_${String(month).padStart(2,'0')}.xlsx`);
}

// ─── パターン設定UI ──────────────────────────────────────────
function PatternEditor({ title, patterns, onAdd, onRemove, onUpdate, color }) {
  return (
    <div style={{ background:'#1e293b', borderRadius:12, padding:20 }}>
      <div style={{ fontWeight:700, marginBottom:4 }}>{title}</div>
      <div style={{ fontSize:12, color:'#64748b', marginBottom:14 }}>
        複数登録するとシフト生成時に日ごとランダム適用されます
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:12 }}>
        {patterns.map(p => (
          <div key={p.id} style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <input
              value={p.label}
              onChange={e => onUpdate(p.id, 'label', e.target.value)}
              style={{ ...inputStyle, width:100 }}
            />
            <span style={{ color:'#64748b', fontSize:13 }}>上級生</span>
            <input
              type="number" min={0} max={10} value={p.senior}
              onChange={e => onUpdate(p.id, 'senior', e.target.value)}
              style={{ ...inputStyle, width:56 }}
            />
            <span style={{ color:'#64748b', fontSize:13 }}>名</span>
            <span style={{ color:'#64748b', fontSize:13 }}>下級生</span>
            <input
              type="number" min={0} max={10} value={p.junior}
              onChange={e => onUpdate(p.id, 'junior', e.target.value)}
              style={{ ...inputStyle, width:56 }}
            />
            <span style={{ color:'#64748b', fontSize:13 }}>名</span>
            <span style={{ color, fontSize:12, fontWeight:600 }}>計{p.senior + p.junior}名</span>
            {patterns.length > 1 && (
              <button onClick={() => onRemove(p.id)} style={{
                padding:'3px 10px', background:'#3b1f1f', border:'none',
                borderRadius:6, color:'#f87171', cursor:'pointer', fontSize:12
              }}>削除</button>
            )}
          </div>
        ))}
      </div>
      <button onClick={onAdd} style={{
        padding:'5px 14px', background:'#1e3a5f', border:'none',
        borderRadius:7, color:'#93c5fd', cursor:'pointer', fontSize:13, fontWeight:600
      }}>＋ パターン追加</button>
    </div>
  );
}

// ─── メインコンポーネント ────────────────────────────────────
export default function ShiftApp() {
  const [tab, setTab] = useState('shift');
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(4);
  const [groups, setGroups] = useState(INITIAL_GROUPS);
  const [ng, setNg] = useState(INITIAL_NG);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [result, setResult] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [ngEditMode, setNgEditMode] = useState('dow');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffGrade, setNewStaffGrade] = useState('first');

  const allStaff = [...groups.third, ...groups.second, ...groups.first];
  const thirdSet = new Set(groups.third);
  const secondSet = new Set(groups.second);
  const daysInMonth = new Date(year, month, 0).getDate();

  // ── シフト生成・出力 ─────────────────────────────────────
  const handleGenerate = useCallback(() => {
    const r = generateShift({ year, month, groups, ng, settings });
    setResult(r);
    setTab('shift');
  }, [year, month, groups, ng, settings]);

  const handleExport = useCallback(() => {
    if (!result) return;
    exportToExcel(result, allStaff, year, month);
  }, [result, allStaff, year, month]);

  // ── NG設定 ───────────────────────────────────────────────
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

  // ── スタッフ管理 ─────────────────────────────────────────
  const addStaff = () => {
    const name = newStaffName.trim();
    if (!name) return;
    if (allStaff.includes(name)) { alert(`「${name}」はすでに登録されています`); return; }
    setGroups(prev => ({ ...prev, [newStaffGrade]: [...prev[newStaffGrade], name] }));
    setNg(prev => ({ ...prev, [name]: emptyNg() }));
    setNewStaffName('');
  };

  const removeStaff = (name) => {
    if (!window.confirm(`「${name}」を削除しますか？`)) return;
    setGroups(prev => ({
      third:  prev.third.filter(s => s !== name),
      second: prev.second.filter(s => s !== name),
      first:  prev.first.filter(s => s !== name),
    }));
    if (selectedStaff === name) setSelectedStaff(null);
  };

  const promoteStaff = (name) => {
    if (thirdSet.has(name)) {
      if (!window.confirm(`「${name}」を卒業（削除）しますか？`)) return;
      setGroups(prev => ({ ...prev, third: prev.third.filter(s => s !== name) }));
      if (selectedStaff === name) setSelectedStaff(null);
    } else if (secondSet.has(name)) {
      setGroups(prev => ({
        ...prev,
        second: prev.second.filter(s => s !== name),
        third:  [...prev.third, name],
      }));
    } else {
      setGroups(prev => ({
        ...prev,
        first:  prev.first.filter(s => s !== name),
        second: [...prev.second, name],
      }));
    }
  };

  // ── パターン管理 ────────────────────────────────────────
  const addPattern = (type) => {
    const id = settings.nextPatternId;
    setSettings(prev => ({
      ...prev,
      [type]: [...prev[type], { id, label: `パターン${id}`, senior: 1, junior: 2 }],
      nextPatternId: id + 1,
    }));
  };

  const removePattern = (type, id) => {
    setSettings(prev => ({ ...prev, [type]: prev[type].filter(p => p.id !== id) }));
  };

  const updatePattern = (type, id, field, value) => {
    setSettings(prev => ({
      ...prev,
      [type]: prev[type].map(p =>
        p.id === id ? { ...p, [field]: field === 'label' ? value : Math.max(0, +value) } : p
      ),
    }));
  };

  // ── レンダリング ─────────────────────────────────────────
  return (
    <div style={{ fontFamily:"'Noto Sans JP', sans-serif", background:'#0f1117', minHeight:'100vh', color:'#e2e8f0' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1e293b,#0f172a)', borderBottom:'1px solid #1e293b', padding:'16px 20px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <div style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.5px', color:'#f8fafc' }}>🐴 シフト管理</div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, flexWrap:'wrap' }}>
          {[['shift','📅 シフト'],['ng','⛔ NG設定'],['staff','👥 スタッフ'],['settings','⚙️ 設定']].map(([key,label])=>(
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
                <input type="number" value={year} onChange={e=>setYear(+e.target.value)}
                  style={{...inputStyle, width:80}} />
                <span style={{color:'#94a3b8'}}>年</span>
                <input type="number" min={1} max={12} value={month} onChange={e=>setMonth(+e.target.value)}
                  style={{...inputStyle, width:56}} />
                <span style={{color:'#94a3b8'}}>月</span>
              </div>
              <button onClick={handleGenerate} style={{
                padding:'8px 24px', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', border:'none',
                borderRadius:10, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer',
                boxShadow:'0 4px 15px rgba(99,102,241,0.4)'
              }}>🎲 シフト生成</button>
              {result && (
                <>
                  <span style={{color:'#34d399',fontSize:13}}>✓ 生成済み ({year}/{month})</span>
                  <button onClick={handleExport} style={{
                    padding:'8px 18px', background:'linear-gradient(135deg,#059669,#047857)', border:'none',
                    borderRadius:10, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer',
                    boxShadow:'0 4px 15px rgba(5,150,105,0.35)'
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
                        const grade = gradeOf(s, result.thirdSet, result.secondSet);
                        const st = result.stats[s];
                        return (
                          <tr key={s} style={{borderTop:'1px solid #0f1117'}}>
                            <td style={{padding:'5px 10px',fontWeight:600}}>{s}</td>
                            <td style={{padding:'5px 10px',textAlign:'center'}}>
                              <span style={{background:GRADE_COLOR[grade]+'22',color:GRADE_COLOR[grade],borderRadius:5,padding:'2px 8px',fontSize:11}}>{grade}</span>
                            </td>
                            {[st.mw,st.me,st.ew,st.total].map((v,i)=>(
                              <td key={i} style={{padding:'5px 10px',textAlign:'center',color:i===3?'#f8fafc':'#cbd5e1',fontWeight:i===3?700:400}}>{v}</td>
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
                        <div style={{textAlign:'center'}}>
                          <div style={{fontWeight:800,fontSize:18,color:isSun?'#f87171':isSat?'#60a5fa':'#f8fafc'}}>{d}</div>
                          <div style={{fontSize:12,color:'#64748b'}}>{DOW[dow]}</div>
                        </div>
                        {[['朝作業',mw,'#fbbf24'],['朝運動',me,'#34d399'],['夕作業',ew,'#818cf8']].map(([label,members,color])=>(
                          <div key={label}>
                            <div style={{fontSize:11,color,fontWeight:600,marginBottom:4}}>{label}</div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                              {members.length===0
                                ? <span style={{color:'#334155',fontSize:12}}>ー</span>
                                : members.map(s=>{
                                    const grade = gradeOf(s, result.thirdSet, result.secondSet);
                                    return (
                                      <span key={s} style={{
                                        background:GRADE_COLOR[grade]+'22',color:GRADE_COLOR[grade],
                                        borderRadius:5,padding:'2px 7px',fontSize:12,fontWeight:500
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
                const grade = gradeOf(s, thirdSet, secondSet);
                return (
                  <button key={s} onClick={()=>setSelectedStaff(s)} style={{
                    padding:'5px 12px', borderRadius:8,
                    border:`1px solid ${selectedStaff===s?GRADE_COLOR[grade]:'#334155'}`,
                    background: selectedStaff===s ? GRADE_COLOR[grade]+'33' : '#1e293b',
                    color: GRADE_COLOR[grade], cursor:'pointer', fontSize:13,
                    fontWeight: selectedStaff===s?700:400
                  }}>{s}</button>
                );
              })}
            </div>

            {selectedStaff && (
              <div style={{ background:'#1e293b', borderRadius:12, padding:20 }}>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:16 }}>{selectedStaff} のNG設定</div>
                <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                  {[['dow','曜日NG'],['date','日付NG']].map(([k,l])=>(
                    <button key={k} onClick={()=>setNgEditMode(k)} style={{
                      padding:'5px 14px', borderRadius:7, border:'none', cursor:'pointer',
                      background: ngEditMode===k?'#6366f1':'#0f1117',
                      color: ngEditMode===k?'#fff':'#64748b', fontSize:13
                    }}>{l}</button>
                  ))}
                </div>

                {ngEditMode==='dow' && (
                  <div style={{ display:'grid', gap:12 }}>
                    {[['morning','朝NG (朝作業・朝運動)','#fbbf24'],['evening','夕NG','#818cf8'],['allday','終日NG','#f87171']].map(([type,label,color])=>(
                      <div key={type}>
                        <div style={{fontSize:13,color,fontWeight:600,marginBottom:8}}>{label}</div>
                        <div style={{display:'flex',gap:6}}>
                          {DOW.map((d,i)=>{
                            const key = type==='morning'?'mDow':type==='evening'?'eDow':'aDow';
                            const active = (ng[selectedStaff]||emptyNg())[key].has(i);
                            return (
                              <button key={d} onClick={()=>toggleNgDow(selectedStaff,type,i)} style={{
                                width:40,height:40,borderRadius:8,border:'none',cursor:'pointer',
                                background: active?color+'44':'#0f1117',
                                color: active?color:'#475569',
                                fontWeight: active?700:400, fontSize:13,
                                outline: active?`2px solid ${color}`:'none'
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
                        <div style={{fontSize:13,color,fontWeight:600,marginBottom:8}}>{label}</div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                          {Array.from({length:daysInMonth},(_,i)=>i+1).map(d=>{
                            const key = type==='morning'?'mDate':type==='evening'?'eDate':'aDate';
                            const active = (ng[selectedStaff]||emptyNg())[key].has(d);
                            return (
                              <button key={d} onClick={()=>toggleNgDate(selectedStaff,type,d)} style={{
                                width:36,height:36,borderRadius:7,border:'none',cursor:'pointer',
                                background: active?color+'44':'#0f1117',
                                color: active?color:'#475569',
                                fontWeight: active?700:400, fontSize:12,
                                outline: active?`2px solid ${color}`:'none'
                              }}>{d}</button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={()=>setNg(prev=>({...prev,[selectedStaff]:emptyNg()}))} style={{
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

        {/* ─── スタッフ管理タブ ─── */}
        {tab==='staff' && (
          <div>
            {/* 追加フォーム */}
            <div style={{ background:'#1e293b', borderRadius:12, padding:20, marginBottom:20 }}>
              <div style={{ fontWeight:700, marginBottom:14 }}>スタッフ追加</div>
              <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                <input
                  value={newStaffName}
                  onChange={e=>setNewStaffName(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addStaff()}
                  placeholder="氏名"
                  style={{...inputStyle, width:130}}
                />
                <select
                  value={newStaffGrade}
                  onChange={e=>setNewStaffGrade(e.target.value)}
                  style={{...inputStyle, padding:'6px 10px'}}
                >
                  <option value="third">3年</option>
                  <option value="second">2年</option>
                  <option value="first">1年</option>
                </select>
                <button onClick={addStaff} style={{
                  padding:'6px 18px', background:'#6366f1', border:'none',
                  borderRadius:8, color:'#fff', cursor:'pointer', fontWeight:700, fontSize:14
                }}>追加</button>
              </div>
            </div>

            {/* 学年別スタッフ一覧 */}
            {[
              ['third','3年','#c084fc'],
              ['second','2年','#60a5fa'],
              ['first','1年','#34d399'],
            ].map(([key,label,color])=>(
              <div key={key} style={{ background:'#1e293b', borderRadius:12, padding:20, marginBottom:12 }}>
                <div style={{ color, fontWeight:700, marginBottom:12, fontSize:14 }}>
                  {label}生 ({groups[key].length}名)
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {groups[key].length === 0 && (
                    <div style={{color:'#475569',fontSize:13,textAlign:'center',padding:'10px 0'}}>スタッフなし</div>
                  )}
                  {groups[key].map(name=>(
                    <div key={name} style={{
                      display:'flex', alignItems:'center', gap:10,
                      padding:'8px 12px', background:'#0f1117', borderRadius:8
                    }}>
                      <span style={{flex:1,fontWeight:600}}>{name}</span>
                      <button onClick={()=>promoteStaff(name)} style={{
                        padding:'4px 12px', fontSize:12, borderRadius:6, border:'none', cursor:'pointer',
                        background: key==='third'?'#451a03':'#1e3a5f',
                        color: key==='third'?'#fdba74':'#93c5fd',
                        fontWeight:600
                      }}>
                        {key==='third'?'卒業':key==='second'?'→3年に繰上':'→2年に繰上'}
                      </button>
                      <button onClick={()=>removeStaff(name)} style={{
                        padding:'4px 12px', fontSize:12, borderRadius:6, border:'none', cursor:'pointer',
                        background:'#3b1f1f', color:'#f87171', fontWeight:600
                      }}>削除</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── 設定タブ ─── */}
        {tab==='settings' && (
          <div style={{ display:'grid', gap:16 }}>

            {/* 朝作業パターン */}
            <PatternEditor
              title="朝作業の人数構成パターン"
              patterns={settings.morningWorkPatterns}
              color="#fbbf24"
              onAdd={() => addPattern('morningWorkPatterns')}
              onRemove={id => removePattern('morningWorkPatterns', id)}
              onUpdate={(id,field,val) => updatePattern('morningWorkPatterns',id,field,val)}
            />

            {/* 夕作業パターン */}
            <PatternEditor
              title="夕作業の人数構成パターン"
              patterns={settings.eveningWorkPatterns}
              color="#818cf8"
              onAdd={() => addPattern('eveningWorkPatterns')}
              onRemove={id => removePattern('eveningWorkPatterns', id)}
              onUpdate={(id,field,val) => updatePattern('eveningWorkPatterns',id,field,val)}
            />

            {/* 朝運動ルール */}
            <div style={{ background:'#1e293b', borderRadius:12, padding:20 }}>
              <div style={{ fontWeight:700, marginBottom:12 }}>朝運動のペアルール</div>
              {[
                ['senior_junior','上級生(3年 or 2年)1名 + 1年生1名'],
                ['any','条件なし（出勤回数の少ない順）'],
              ].map(([val,label])=>(
                <label key={val} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,cursor:'pointer'}}>
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

            {/* 連勤ルール説明 */}
            <div style={{ background:'#1e293b', borderRadius:12, padding:20 }}>
              <div style={{ fontWeight:700, marginBottom:8 }}>連勤ルール</div>
              <div style={{ fontSize:13, color:'#94a3b8', lineHeight:1.8 }}>
                <div>・朝作業・朝運動・夕作業のいずれかに割り当てられた日を「出勤日」として連勤カウント</div>
                <div>・原則として連勤が発生しないようシフトを作成</div>
                <div>・やむを得ない場合のみ最大2連勤まで許可（3連勤以上はブロック）</div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
