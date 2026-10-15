// Expert Dashboard Component for Extension Officers & Agricultural Specialists
// Features: Single-expert inquiry claiming, exclusive lock visibility, district filtering & queues
import { useState } from 'react';

const SRI_LANKAN_DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
  'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
  'Mannar', 'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa',
  'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya'
];

export default function ExpertDashboard({ 
  currentUser, 
  consultations = [], 
  onSelectConsultation, 
  onClaimTicket, 
  onReleaseTicket, 
  setActiveView 
}) {
  const [districtFilter, setDistrictFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('unassigned'); // 'unassigned' | 'my_claimed' | 'other_claimed' | 'resolved'

  const currentEmail = (currentUser?.email || '').toLowerCase().trim();

  // Cohort filters
  const unassignedList = consultations.filter(c => !c.assignedExpertEmail || c.status === 'Pending');
  const myClaimedList = consultations.filter(c => c.assignedExpertEmail && c.assignedExpertEmail.toLowerCase() === currentEmail && c.status !== 'Resolved');
  const otherClaimedList = consultations.filter(c => c.assignedExpertEmail && c.assignedExpertEmail.toLowerCase() !== currentEmail && c.status !== 'Resolved');
  const resolvedList = consultations.filter(c => c.status === 'Resolved');

  let tabPool = [];
  if (activeTab === 'unassigned') tabPool = unassignedList;
  else if (activeTab === 'my_claimed') tabPool = myClaimedList;
  else if (activeTab === 'other_claimed') tabPool = otherClaimedList;
  else if (activeTab === 'resolved') tabPool = resolvedList;

  const filtered = tabPool.filter(c => {
    const matchesDistrict = districtFilter === 'all' || c.farmerDistrict === districtFilter;
    const matchesSearch = (c.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (c.farmerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (c.ticketId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (c.cropLabel || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDistrict && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-amber-950 text-white py-8 px-4 sm:px-6 lg:px-8 border-b border-amber-900/40 shadow-xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs bg-amber-500/20 text-amber-300 font-bold px-3 py-1 rounded-full border border-amber-500/40 shadow-sm flex items-center gap-1.5">
                👨‍🌾 Official Extension Officer Desk
              </span>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 font-bold px-3 py-1 rounded-full border border-emerald-500/40">
                Department of Agriculture • Peradeniya
              </span>
              <span className="text-xs bg-white/10 text-white/90 font-bold px-3 py-1 rounded-full border border-white/20">
                Logged in: {currentUser?.email || 'expert@govisahana.lk'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
              {currentUser?.name || 'Dr. Nimal Jayasinghe'}
            </h1>
            <p className="text-xs sm:text-sm text-amber-200/80 mt-1 font-medium">
              {currentUser?.cropOrDept || 'Senior Agronomist & Plant Pathologist'} • Single-Expert Case Claiming System
            </p>
          </div>

          {/* District Filter Dropdown */}
          <div className="flex items-center gap-3 shrink-0">
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="px-4 py-3 rounded-xl text-xs font-black bg-slate-900 text-amber-100 border border-amber-500/40 outline-none cursor-pointer shadow-lg hover:border-amber-400 transition"
            >
              <option value="all">All Sri Lankan Districts ({SRI_LANKAN_DISTRICTS.length})</option>
              {SRI_LANKAN_DISTRICTS.map(d => <option key={d} value={d}>{d} District</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        
        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button 
            onClick={() => setActiveTab('unassigned')}
            className={`text-left p-5 rounded-2xl border transition shadow-sm bg-white ${
              activeTab === 'unassigned' ? 'ring-2 ring-amber-500 bg-amber-50/50 border-amber-500/40' : 'border-slate-200 hover:border-amber-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-700">🟡 Available Inquiries</span>
              <span className="text-xs font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{unassignedList.length}</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-amber-600">{unassignedList.length}</p>
            <p className="text-[11px] text-slate-500">Unclaimed by specialists</p>
          </button>

          <button 
            onClick={() => setActiveTab('my_claimed')}
            className={`text-left p-5 rounded-2xl border transition shadow-sm bg-white ${
              activeTab === 'my_claimed' ? 'ring-2 ring-emerald-500 bg-emerald-50/50 border-emerald-500/40' : 'border-slate-200 hover:border-emerald-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-700">🟢 My Claimed Chats</span>
              <span className="text-xs font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">{myClaimedList.length}</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-600">{myClaimedList.length}</p>
            <p className="text-[11px] text-slate-500">Exclusively assigned to you</p>
          </button>

          <button 
            onClick={() => setActiveTab('other_claimed')}
            className={`text-left p-5 rounded-2xl border transition shadow-sm bg-white ${
              activeTab === 'other_claimed' ? 'ring-2 ring-red-500 bg-red-50/50 border-red-500/40' : 'border-slate-200 hover:border-red-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-700">🔒 Colleagues' Cases</span>
              <span className="text-xs font-black bg-red-100 text-red-800 px-2 py-0.5 rounded-full">{otherClaimedList.length}</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-red-600">{otherClaimedList.length}</p>
            <p className="text-[11px] text-slate-500">Locked to other experts</p>
          </button>

          <button 
            onClick={() => setActiveTab('resolved')}
            className={`text-left p-5 rounded-2xl border transition shadow-sm bg-white ${
              activeTab === 'resolved' ? 'ring-2 ring-blue-500 bg-blue-50/50 border-blue-500/40' : 'border-slate-200 hover:border-blue-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-700">🔵 Resolved Cases</span>
              <span className="text-xs font-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{resolvedList.length}</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-blue-600">{resolvedList.length}</p>
            <p className="text-[11px] text-slate-500">Remedies issued</p>
          </button>
        </div>

        {/* Queue Management Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          
          {/* Header & Tabs */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900">
                  {activeTab === 'unassigned' && '🟡 Available Farmer Inquiries (Waiting for Claim)'}
                  {activeTab === 'my_claimed' && '🟢 My Claimed Consultations (Exclusively Yours)'}
                  {activeTab === 'other_claimed' && '🔒 Colleagues\' Consultations (Read-Only)'}
                  {activeTab === 'resolved' && '🔵 Resolved Cases History'}
                </h2>
                <span className="text-xs bg-amber-100 text-amber-900 font-extrabold px-2.5 py-0.5 rounded-full">
                  {filtered.length} Cases
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {activeTab === 'unassigned' && 'Click "Claim & Open Chat" to lock an inquiry exclusively to your account.'}
                {activeTab === 'my_claimed' && 'These cases are accessible only by you and the farmer. Other experts cannot reply.'}
                {activeTab === 'other_claimed' && 'These cases are actively claimed by other agronomists. Access is restricted.'}
                {activeTab === 'resolved' && 'Official agronomist remedy cards issued.'}
              </p>
            </div>

            {/* Search Bar */}
            <div className="w-full sm:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search crop, farmer, or ticket ID..."
                className="w-full px-4 py-2.5 rounded-xl text-xs border border-slate-300 outline-none bg-slate-50 text-slate-900 font-medium placeholder-slate-400 focus:border-amber-500 focus:bg-white transition shadow-sm"
              />
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-4">
            {filtered.length === 0 ? (
              <div className="text-center py-12 p-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50">
                <p className="font-bold text-base text-slate-700 mb-1">No Consultations in this View</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {activeTab === 'unassigned' && '🎉 All incoming farmer inquiries are currently claimed and handled!'}
                  {activeTab === 'my_claimed' && 'You have no open claimed cases. Claim a pending inquiry from the Available tab!'}
                  {activeTab === 'other_claimed' && 'No cases are currently assigned to other agronomists.'}
                  {activeTab === 'resolved' && 'No resolved cases found matching your filters.'}
                </p>
              </div>
            ) : (
              filtered.map(c => {
                const cid = c._id || c.id;
                const isMine = c.assignedExpertEmail && c.assignedExpertEmail.toLowerCase() === currentEmail;
                const isOther = c.assignedExpertEmail && c.assignedExpertEmail.toLowerCase() !== currentEmail;
                const isUnclaimed = !c.assignedExpertEmail || c.status === 'Pending';

                return (
                  <div 
                    key={cid} 
                    className={`p-5 rounded-2xl border transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-5 hover:shadow-md ${
                      isMine 
                        ? 'border-emerald-300 bg-emerald-50/40' 
                        : isOther 
                        ? 'border-red-200 bg-red-50/30' 
                        : 'border-amber-200 bg-amber-50/40'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {c.sampleImage && (
                        <img 
                          src={c.sampleImage} 
                          alt="Farmer crop request" 
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-slate-200 shadow-sm shrink-0 cursor-pointer hover:scale-105 transition" 
                          onClick={() => window.open(c.sampleImage, '_blank')}
                        />
                      )}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200">
                            📍 {c.farmerDistrict}
                          </span>
                          <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            {c.cropLabel}
                          </span>
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold">
                            {c.ticketId}
                          </span>

                          {/* Assignment status badge */}
                          {isUnclaimed && (
                            <span className="text-xs font-extrabold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-300">
                              ⚡ Unassigned
                            </span>
                          )}
                          {isMine && (
                            <span className="text-xs font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-300">
                              ✓ Assigned to You
                            </span>
                          )}
                          {isOther && (
                            <span className="text-xs font-extrabold bg-red-100 text-red-800 px-2.5 py-0.5 rounded-full border border-red-300 flex items-center gap-1">
                              🔒 Claimed by {c.assignedExpertName}
                            </span>
                          )}
                        </div>

                        <h3 className="font-extrabold text-base sm:text-lg text-slate-900">
                          {c.title}
                        </h3>
                        <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                          {c.description}
                        </p>
                        <p className="text-[11px] text-slate-500 font-semibold pt-0.5">
                          Farmer: <strong className="font-extrabold text-slate-800">{c.farmerName}</strong> {c.farmerPhone ? `• ${c.farmerPhone}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isUnclaimed && (
                        <button
                          onClick={async () => {
                            if (onClaimTicket) {
                              const ok = await onClaimTicket(cid);
                              if (ok) {
                                onSelectConsultation(cid);
                                setActiveView('consultation_room');
                              }
                            } else {
                              onSelectConsultation(cid);
                              setActiveView('consultation_room');
                            }
                          }}
                          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-md transition transform hover:scale-105 flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>✋</span>
                          <span>Claim & Open Chat →</span>
                        </button>
                      )}

                      {isMine && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              onSelectConsultation(cid);
                              setActiveView('consultation_room');
                            }}
                            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs rounded-xl shadow-md transition flex items-center gap-1 cursor-pointer"
                          >
                            <span>💬</span>
                            <span>Open Chat Room →</span>
                          </button>

                          {onReleaseTicket && c.status !== 'Resolved' && (
                            <button
                              onClick={() => {
                                if (confirm('Release this consultation back to the open agronomist desk?')) {
                                  onReleaseTicket(cid);
                                }
                              }}
                              className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                              title="Release to colleague"
                            >
                              ⇄ Release
                            </button>
                          )}
                        </div>
                      )}

                      {isOther && (
                        <button
                          onClick={() => {
                            onSelectConsultation(cid);
                            setActiveView('consultation_room');
                          }}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>👁️</span>
                          <span>View Thread (Read-Only)</span>
                        </button>
                      )}

                      {c.status === 'Resolved' && (
                        <button
                          onClick={() => {
                            onSelectConsultation(cid);
                            setActiveView('consultation_room');
                          }}
                          className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer"
                        >
                          View Remedy & Chat →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
