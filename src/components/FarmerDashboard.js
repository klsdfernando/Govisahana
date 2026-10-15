// Farmer Dashboard Component with Prominent Request Consultation CTA and Ticket List
import { useState } from 'react';

export default function FarmerDashboard({ consultations, onOpenNewTicketModal, onSelectConsultation, setActiveView }) {
  const [filterStatus, setFilterStatus] = useState('All');

  const filteredConsultations = consultations.filter(item => {
    if (filterStatus === 'All') return true;
    return item.status.toLowerCase() === filterStatus.toLowerCase();
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'In Progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
            In Progress
          </span>
        );
      case 'Pending':
      case 'Requested':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <span>⏳</span> Waiting for Specialist
          </span>
        );
      case 'Resolved':
      case 'Completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <span>✔️</span> Resolved (Remedy Issued)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      
      {/* Top Banner / Welcome Bar */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-emerald-950 text-white py-8 px-4 sm:px-6 lg:px-8 shadow-inner">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-emerald-700 text-emerald-200 font-bold px-2.5 py-0.5 rounded-full border border-emerald-600">
                📍 Anuradhapura District
              </span>
              <span className="text-xs text-emerald-300 font-medium">• Maha Season 2026</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Ayubowan, Sunil Rathnayake! (ආයුබෝවන්)
            </h1>
            <p className="text-xs sm:text-sm text-emerald-200 mt-1">
              Registered Paddy & Vegetable Farmer • Kekirawa Agrarian Division
            </p>
          </div>

          {/* Prominent High-Contrast "Request Consultation" CTA Button */}
          <button
            onClick={onOpenNewTicketModal}
            className="group relative inline-flex items-center justify-center gap-3 px-6 py-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-base sm:text-lg rounded-2xl shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-0.5 ring-4 ring-amber-400/30 cursor-pointer"
          >
            <span className="w-9 h-9 rounded-xl bg-slate-950 text-white flex items-center justify-center text-xl font-bold shadow-md">
              +
            </span>
            <div className="text-left leading-tight">
              <span className="block text-xs uppercase tracking-wider font-extrabold text-slate-800">Need Crop Advice?</span>
              <span className="block text-base sm:text-lg font-black text-slate-950">REQUEST CONSULTATION</span>
            </div>
          </button>

        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        
        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-lg">
              💬
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">
                {consultations.filter(c => c.status === 'In Progress').length}
              </p>
              <p className="text-xs text-gray-500 font-medium">Active Chats</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold text-lg">
              ⏳
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">
                {consultations.filter(c => c.status === 'Requested').length}
              </p>
              <p className="text-xs text-gray-500 font-medium">Pending Experts</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center font-bold text-lg">
              ✔️
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">
                {consultations.filter(c => c.status === 'Completed').length}
              </p>
              <p className="text-xs text-gray-500 font-medium">Resolved Tickets</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-900 flex items-center justify-center font-bold text-lg">
              👨‍🌾
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">3</p>
              <p className="text-xs text-gray-500 font-medium">Assigned Officers</p>
            </div>
          </div>

        </div>

        {/* Tickets Section Header & Filters */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Your Consultations & Tickets</h2>
              <p className="text-xs text-gray-500">Track real-time status of your agricultural queries</p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto text-xs font-semibold">
              {['All', 'In Progress', 'Accepted', 'Requested', 'Completed'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition ${
                    filterStatus === st ? 'bg-white text-emerald-800 shadow-sm font-bold' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Tickets List */}
          {filteredConsultations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-3xl mb-2">🌾</p>
              <p className="font-semibold text-sm">No consultations found in this category.</p>
              <button
                onClick={onOpenNewTicketModal}
                className="mt-4 px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm"
              >
                + Create New Consultation Request
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredConsultations.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-50 hover:bg-emerald-50/40 p-5 rounded-2xl border border-gray-200 hover:border-emerald-300 transition duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left Ticket Info */}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-2xl shadow-sm shrink-0">
                      {item.cropType === 'paddy' ? '🌾' : item.cropType === 'vegetables' ? '🥬' : '🌱'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{item.ticketId}</span>
                        <span className="text-xs bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded-md">
                          {item.cropLabel}
                        </span>
                        <span className="text-xs bg-gray-200 text-gray-700 font-medium px-2 py-0.5 rounded-md">
                          {item.channel} Channel
                        </span>
                        {getStatusBadge(item.status)}
                      </div>

                      <h3 className="font-bold text-slate-900 text-base mb-1">
                        {item.title}
                      </h3>

                      <p className="text-xs text-gray-600 line-clamp-2 max-w-2xl mb-2">
                        {item.description}
                      </p>

                      <div className="flex items-center gap-4 text-[11px] text-gray-500">
                        <span>Submitted: {item.createdAt}</span>
                        <span>•</span>
                        <span>Last Update: {item.lastActivity}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Assigned Expert & Action */}
                  <div className="flex flex-col sm:flex-row md:flex-col items-end justify-between md:justify-center gap-3 border-t md:border-t-0 md:border-l border-gray-200 pt-3 md:pt-0 md:pl-5 shrink-0">
                    {item.assignedExpertName || item.assignedExpert ? (
                      <div className="flex items-center gap-2 text-right">
                        <div>
                          <p className="text-xs font-bold text-slate-900">{item.assignedExpertName || item.assignedExpert?.name}</p>
                          <p className="text-[10px] text-gray-500 max-w-[140px] truncate">Agricultural Extension Specialist</p>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm border border-emerald-400">
                          👨‍🌾
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 font-medium">
                        Assigning extension officer...
                      </div>
                    )}

                    <button
                      onClick={() => {
                        onSelectConsultation(item._id || item.id);
                        setActiveView('consultation_room');
                      }}
                      className="w-full sm:w-auto px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>{item.status === 'In Progress' ? 'Open Chat Room' : 'View Consultation'}</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                </div>
              ))}
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
