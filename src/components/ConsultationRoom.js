// Consultation Room Chat Interface Component
// Enforces single-expert exclusive lock, real-time message sync, photo attachments, and prescription issuance
import { useState, useRef, useEffect } from 'react';

const API_BASE = '';

const PRESET_DIAGNOSES = [
  {
    name: 'Paddy Blast (Pyricularia oryzae)',
    crop: 'Paddy',
    treatment: 'Tricyclazole 75% WP or Azoxystrobin',
    dosage: '10g - 12g per 16L knapsack sprayer',
    timing: 'Spray early morning or late afternoon after light dew evaporates.'
  },
  {
    name: 'Brown Plant Hopper (Nilaparvata lugens)',
    crop: 'Paddy',
    treatment: 'Pymetrozine 50% WDG or Dinotefuran 20% SG',
    dosage: '12g per 16L tank; ensure nozzle reaches base of stem.',
    timing: 'Drain standing water 3-4 days before spraying.'
  },
  {
    name: 'Chili Leaf Curl Virus (Whitefly Vector)',
    crop: 'Chili',
    treatment: 'Imidacloprid 200 SL or Acetamiprid 20% SP',
    dosage: '5ml - 7ml per 10L water; add sticker solution.',
    timing: 'Target underside of leaves where whiteflies colonize.'
  },
  {
    name: 'Coconut Black Headed Caterpillar',
    crop: 'Coconut',
    treatment: 'Neem-based organic repellant + Parasitoid release (Goniozus nephantidis)',
    dosage: '30ml neem oil + 5g soap in 10L water',
    timing: 'Spray lower fronds; coordinate with CRI for parasitoid wasp release.'
  }
];

export default function ConsultationRoom({
  consultation,
  onSendMessage,
  onClaimTicket,
  onReleaseTicket,
  onIssuePrescription,
  onBackToDashboard,
  currentUser
}) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [sending, setSending] = useState(false);
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [prescriptionDiagnosis, setPrescriptionDiagnosis] = useState('');
  const [prescriptionTreatment, setPrescriptionTreatment] = useState('');
  const [prescriptionDosage, setPrescriptionDosage] = useState('');
  const [prescriptionTiming, setPrescriptionTiming] = useState('');

  const [currentConsultation, setCurrentConsultation] = useState(consultation || {});
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const activeId = consultation?._id || consultation?.id || '';
  const isExpert = currentUser?.role === 'expert';
  const isFarmer = currentUser?.role === 'farmer';

  const currentEmail = (currentUser?.email || '').toLowerCase().trim();
  const assignedEmail = (currentConsultation?.assignedExpertEmail || '').toLowerCase().trim();

  const isUnassigned = !assignedEmail || currentConsultation?.status === 'Pending';
  const isClaimedByMe = isExpert && assignedEmail && assignedEmail === currentEmail;
  const isClaimedByOther = isExpert && assignedEmail && assignedEmail !== currentEmail;

  // Real-time polling function
  const syncChatData = async () => {
    if (!activeId) return;
    try {
      const [msgRes, conRes] = await Promise.all([
        fetch(`${API_BASE}/api/consultations/${activeId}/messages`),
        fetch(`${API_BASE}/api/consultations/${activeId}`)
      ]);
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        if (Array.isArray(msgData)) setMessages(msgData);
      }
      if (conRes.ok) {
        const conData = await conRes.json();
        if (conData && (conData._id || conData.id)) setCurrentConsultation(conData);
      }
    } catch (err) {
      // Polling fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    syncChatData();
    const timer = setInterval(syncChatData, 2500);
    return () => clearInterval(timer);
  }, [activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if ((!text.trim() && !photo) || sending) return;
    if (isClaimedByOther) return; // Enforce single-expert lock

    const payload = {
      senderName: currentUser?.name || 'User',
      senderRole: currentUser?.role || 'farmer',
      senderEmail: currentUser?.email || '',
      text: text.trim(),
      image: photo
    };

    setSending(true);
    setText('');
    setPhoto(null);

    // Optimistic message append
    const tempMsg = {
      id: `temp_${Date.now()}`,
      _id: `temp_${Date.now()}`,
      consultationId: activeId,
      ...payload,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempMsg]);

    if (onSendMessage) {
      const savedMsg = await onSendMessage(activeId, payload);
      if (savedMsg) {
        syncChatData();
      }
    } else {
      try {
        await fetch(`${API_BASE}/api/consultations/${activeId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        syncChatData();
      } catch (err) {
        console.error(err);
      }
    }
    setSending(false);
  };

  const handlePresetSelect = (preset) => {
    setPrescriptionDiagnosis(preset.name);
    setPrescriptionTreatment(preset.treatment);
    setPrescriptionDosage(preset.dosage);
    setPrescriptionTiming(preset.timing);
  };

  const handleIssuePrescriptionSubmit = async (e) => {
    e.preventDefault();
    if (!prescriptionDiagnosis || !prescriptionTreatment) return;
    const rx = {
      diagnosis: prescriptionDiagnosis,
      treatment: prescriptionTreatment,
      dosage: prescriptionDosage,
      timing: prescriptionTiming,
      expertName: currentUser?.name || 'Senior Agronomist',
      expertEmail: currentUser?.email || 'nimal@govisahana.lk'
    };

    if (onIssuePrescription) {
      const ok = await onIssuePrescription(activeId, rx);
      if (ok) {
        setIsPrescriptionModalOpen(false);
        syncChatData();
      }
    } else {
      try {
        const res = await fetch(`${API_BASE}/api/consultations/${activeId}/prescription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prescription: rx, expertEmail: currentUser?.email })
        });
        if (res.ok) {
          setIsPrescriptionModalOpen(false);
          syncChatData();
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleClaimClick = async () => {
    if (onClaimTicket) {
      const ok = await onClaimTicket(activeId);
      if (ok) syncChatData();
    } else {
      try {
        const res = await fetch(`${API_BASE}/api/consultations/${activeId}/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expertId: currentUser?.id || 'exp_1',
            expertName: currentUser?.name || 'Dr. Nimal Jayasinghe',
            expertEmail: currentUser?.email || 'nimal@govisahana.lk'
          })
        });
        if (res.ok) syncChatData();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleReleaseClick = async () => {
    if (!confirm('Are you sure you want to release this consultation back to the open agronomist desk?')) return;
    if (onReleaseTicket) {
      const ok = await onReleaseTicket(activeId);
      if (ok) syncChatData();
    } else {
      try {
        const res = await fetch(`${API_BASE}/api/consultations/${activeId}/release`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expertEmail: currentUser?.email })
        });
        if (res.ok) syncChatData();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const expertDisplayName = currentConsultation?.assignedExpertName || 'Agronomist';
  const isResolved = currentConsultation?.status === 'Resolved';

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-slate-100">
      
      {/* Header Controls */}
      <div className="bg-white border-b border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button 
            onClick={onBackToDashboard} 
            className="px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 transition shrink-0 cursor-pointer"
          >
            ← Dashboard
          </button>

          <div className="flex items-center gap-2.5 border-l border-slate-200 pl-3">
            {currentConsultation?.assignedExpertName ? (
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900">{expertDisplayName}</h3>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-300 font-bold">
                    ✓ Extension Officer
                  </span>
                  {isClaimedByMe && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded border border-emerald-300">
                      Assigned to You
                    </span>
                  )}
                  {isClaimedByOther && (
                    <span className="text-[10px] bg-red-100 text-red-800 font-extrabold px-1.5 py-0.5 rounded border border-red-300 flex items-center gap-1">
                      🔒 Locked to Colleague
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  {currentConsultation?.ticketId} • {currentConsultation?.cropLabel || 'Crop'} • {currentConsultation?.farmerDistrict} District
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-black text-sm border border-amber-300">
                  ⏳
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-amber-800">Waiting for Agricultural Specialist</h3>
                  <p className="text-[11px] text-slate-500">Ticket: {currentConsultation?.ticketId} • Farmer: {currentConsultation?.farmerName}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Bar based on Role & Claim state */}
        <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
          {isExpert && isUnassigned && (
            <button 
              onClick={handleClaimClick} 
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow transition transform hover:scale-105 flex items-center gap-1.5 cursor-pointer"
            >
              <span>✋</span>
              <span>Claim Consultation</span>
            </button>
          )}

          {isExpert && isClaimedByMe && (
            <>
              {!isResolved && (
                <button 
                  onClick={() => setIsPrescriptionModalOpen(true)} 
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow transition flex items-center gap-1 cursor-pointer"
                >
                  <span>📋</span>
                  <span>Issue Official Remedy</span>
                </button>
              )}
              {!isResolved && (
                <button 
                  onClick={handleReleaseClick} 
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition cursor-pointer"
                  title="Release this inquiry back to the pool"
                >
                  ⇄ Release
                </button>
              )}
            </>
          )}

          {isResolved && (
            <span className="px-3 py-1.5 bg-blue-100 text-blue-800 border border-blue-300 font-extrabold text-xs rounded-xl flex items-center gap-1">
              <span>✔️</span>
              <span>Resolved with Remedy</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Chat Stream */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <div className="max-w-3xl mx-auto space-y-4">
          
          {/* Initial Ticket Inscription Card */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm text-xs">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <span className="font-extrabold text-emerald-800 uppercase text-[10px] tracking-wider">
                Farmer Advisory Ticket Brief
              </span>
              <span className="font-mono text-slate-500 font-bold">{currentConsultation?.ticketId}</span>
            </div>
            <h4 className="font-extrabold text-slate-900 text-sm mb-1">{currentConsultation?.title}</h4>
            <p className="text-slate-600 leading-relaxed">{currentConsultation?.description}</p>
            {currentConsultation?.sampleImage && (
              <div className="mt-3">
                <img 
                  src={currentConsultation.sampleImage} 
                  alt="Crop issue" 
                  className="rounded-xl max-h-48 object-cover border border-slate-200 shadow-sm cursor-pointer hover:opacity-95" 
                  onClick={() => window.open(currentConsultation.sampleImage, '_blank')}
                />
              </div>
            )}
          </div>

          {/* Messages list */}
          {messages.map((msg, idx) => {
            const isSys = msg.senderRole === 'system';
            const isMsgRx = !!msg.prescription;

            if (isSys) {
              return (
                <div key={msg._id || msg.id || idx} className="text-center my-2">
                  <span className="inline-block px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold">
                    {msg.text}
                  </span>
                </div>
              );
            }

            if (isMsgRx) {
              const rx = msg.prescription || {};
              return (
                <div key={msg._id || msg.id || idx} className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-5 shadow-md max-w-xl mx-auto">
                  <div className="flex items-center justify-between border-b border-amber-200 pb-3 mb-3">
                    <div>
                      <span className="text-[10px] font-black uppercase text-amber-900 bg-amber-200 px-2 py-0.5 rounded">
                        Official Agronomist Remedy Card
                      </span>
                      <h4 className="font-black text-amber-950 text-base mt-1">{rx.title || rx.diagnosis || 'Official Remedy'}</h4>
                    </div>
                    <button onClick={() => window.print()} className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-lg shadow transition cursor-pointer">
                      Print Card
                    </button>
                  </div>

                  <div className="space-y-2.5 text-xs text-slate-800">
                    <div>
                      <span className="font-extrabold text-amber-900">Target Treatment / Chemical:</span>
                      <p className="font-bold text-slate-900 text-sm bg-white p-2.5 rounded-xl border border-amber-300 mt-0.5">{rx.treatment}</p>
                    </div>
                    <div>
                      <span className="font-extrabold text-amber-900">Mixing Ratio & Dosage:</span>
                      <p className="font-semibold text-slate-700">{rx.dosage}</p>
                    </div>
                    <div>
                      <span className="font-extrabold text-amber-900">Timing & Safety Warnings:</span>
                      <p className="font-semibold text-slate-700">{rx.timing}</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-amber-200 flex items-center justify-between text-[11px] font-bold text-amber-900">
                    <span>Issued By: {rx.expertName || expertDisplayName}</span>
                    <span>{rx.date || 'Today'}</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg._id || msg.id || idx} className={`flex ${msg.senderRole === 'farmer' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-md rounded-2xl p-3.5 shadow-sm ${
                  msg.senderRole === 'farmer' 
                    ? 'bg-emerald-700 text-white font-medium' 
                    : 'bg-white text-slate-900 border border-slate-200'
                }`}>
                  <div className={`text-[10px] font-bold mb-1 flex items-center justify-between gap-3 ${
                    msg.senderRole === 'farmer' ? 'text-emerald-100' : 'text-slate-500'
                  }`}>
                    <span>{msg.senderName} ({msg.senderRole === 'expert' ? 'Agronomist' : 'Farmer'})</span>
                    <span>{msg.timestamp}</span>
                  </div>
                  {msg.image && (
                    <img 
                      src={msg.image} 
                      alt="Crop photo attachment" 
                      className="rounded-xl max-h-60 w-full object-cover mb-2 border border-slate-200 shadow cursor-pointer hover:opacity-95 transition"
                      onClick={() => window.open(msg.image, '_blank')}
                    />
                  )}
                  <p className="text-xs sm:text-sm font-medium leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Photo attachment preview bar */}
      {photo && (
        <div className="bg-emerald-50 p-2 px-4 border-t border-emerald-200 flex items-center justify-between max-w-3xl mx-auto w-full">
          <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
            <span>📷</span>
            <span>Crop Photo Attached (Ready to Send)</span>
          </span>
          <button onClick={() => setPhoto(null)} className="text-xs text-red-600 font-bold hover:underline cursor-pointer">Remove</button>
        </div>
      )}

      {/* Message Input Controls or Single-Expert Locked Banner */}
      <div className="bg-white border-t border-slate-200 p-3">
        {isClaimedByOther ? (
          <div className="max-w-3xl mx-auto text-center py-2">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-300 text-red-700 font-bold text-xs">
              <span>🔒</span>
              <span>Chat Input Locked — Exclusively assigned to {currentConsultation.assignedExpertName}. Only they can reply to this farmer.</span>
            </span>
          </div>
        ) : (
          <form onSubmit={handleSend} className="max-w-3xl mx-auto flex gap-2">
            <label className="p-2.5 rounded-xl bg-slate-100 border border-slate-300 cursor-pointer hover:bg-slate-200 transition flex items-center justify-center shrink-0">
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setPhoto(reader.result);
                    reader.readAsDataURL(file);
                  }
                }} 
                className="hidden" 
              />
              <span>📷</span>
            </label>
            <input 
              type="text" 
              value={text} 
              onChange={(e) => setText(e.target.value)} 
              placeholder={isExpert ? "Type agronomist advisory reply..." : "Ask your agricultural question..."} 
              className="flex-1 px-4 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm outline-none font-medium bg-slate-50 focus:bg-white focus:border-emerald-600 transition" 
            />
            <button 
              type="submit" 
              disabled={sending || (!text.trim() && !photo)}
              className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow transition shrink-0 cursor-pointer"
            >
              {sending ? '...' : 'Send'}
            </button>
          </form>
        )}
      </div>

      {/* Prescription Modal for Experts */}
      {isPrescriptionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-xl bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200">
            <div className="bg-gradient-to-r from-amber-900 to-amber-950 p-5 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-lg text-white">Issue Official Agronomist Remedy</h3>
              <button onClick={() => setIsPrescriptionModalOpen(false)} className="w-8 h-8 rounded-full bg-amber-800 text-white font-bold text-sm hover:bg-amber-700 transition">✕</button>
            </div>

            <form onSubmit={handleIssuePrescriptionSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Preset Diagnosis</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PRESET_DIAGNOSES.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handlePresetSelect(p)}
                      className="text-left p-2.5 rounded-xl border border-slate-200 hover:border-amber-500 bg-slate-50 hover:bg-amber-50/50 text-xs transition"
                    >
                      <span className="font-bold text-slate-900 block">{p.name}</span>
                      <span className="text-[10px] text-slate-500">{p.crop}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Diagnosis / Pest Name</label>
                <input
                  type="text"
                  value={prescriptionDiagnosis}
                  onChange={(e) => setPrescriptionDiagnosis(e.target.value)}
                  placeholder="e.g. Paddy Blast Disease (Pyricularia oryzae)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 outline-none focus:border-amber-600 bg-slate-50"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Recommended Treatment / Chemical</label>
                <input
                  type="text"
                  value={prescriptionTreatment}
                  onChange={(e) => setPrescriptionTreatment(e.target.value)}
                  placeholder="e.g. Tricyclazole 75% WP or Azoxystrobin"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-900 outline-none focus:border-amber-600 bg-slate-50"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mixing Ratio & Dosage</label>
                  <input
                    type="text"
                    value={prescriptionDosage}
                    onChange={(e) => setPrescriptionDosage(e.target.value)}
                    placeholder="e.g. 10g - 12g per 16L knapsack sprayer"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 outline-none focus:border-amber-600 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Application Timing & Weather</label>
                  <input
                    type="text"
                    value={prescriptionTiming}
                    onChange={(e) => setPrescriptionTiming(e.target.value)}
                    placeholder="e.g. Spray early morning after dew dries"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 outline-none focus:border-amber-600 bg-slate-50"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPrescriptionModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow transition"
                >
                  Issue Remedy Card & Close Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
