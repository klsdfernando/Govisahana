// New Ticket Modal Form Component for Creating Consultation Requests
import { useState } from 'react';
import { CROP_TYPES } from '../data/mockData';

export default function NewTicketModal({ isOpen, onClose, onSubmitTicket, currentUser }) {
  const [title, setTitle] = useState('');
  const [cropType, setCropType] = useState('paddy');
  const [description, setDescription] = useState('');
  const [channel, setChannel] = useState('Chat'); // Chat, Voice, Video
  const [urgency, setUrgency] = useState('High');
  const [photoPreview, setPhotoPreview] = useState(null);

  if (!isOpen) return null;

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title || !description) return;

    const selectedCropObj = CROP_TYPES.find(c => c.id === cropType) || CROP_TYPES[0];

    const newTicket = {
      id: `con_${Date.now()}`,
      ticketId: `GS-2026-${Math.floor(100 + Math.random() * 900)}`,
      farmerId: currentUser?.id || 'usr_farmer_1',
      farmerName: currentUser?.name || 'Sunil Rathnayake',
      farmerDistrict: currentUser?.district || 'Anuradhapura',
      farmerEmail: currentUser?.email || 'sunil@farmer.lk',
      farmerPhone: currentUser?.phone || '+94 77 555 1212',
      title,
      cropType,
      cropLabel: selectedCropObj.name.split(' ')[0],
      description,
      channel,
      status: 'Pending',
      urgency,
      assignedExpert: null,
      assignedExpertName: null,
      assignedExpertEmail: null,
      createdAt: 'Just now',
      lastActivity: 'Just now',
      sampleImage: photoPreview || 'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?auto=format&fit=crop&w=800&q=80'
    };

    onSubmitTicket(newTicket);
    // Reset state & close
    setTitle('');
    setDescription('');
    setPhotoPreview(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden my-8 animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-xl">
              🌾
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-white">Create Consultation Request</h3>
              <p className="text-xs text-emerald-200">ගොවි උපදෙස් ඉල්ලුම් පත්‍රය • Request Extension Officer</p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-emerald-700 hover:bg-emerald-600 text-white flex items-center justify-center text-sm font-bold transition"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* Issue Title */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Issue Title / Problem Summary (ගැටලුවේ මාතෘකාව) *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Yellowing leaf tips & fungal spots on 3-acre paddy field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-emerald-600 outline-none font-semibold text-slate-900"
            />
          </div>

          {/* Crop Type Visual Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Select Affected Crop Type (බෝග වර්ගය) *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CROP_TYPES.map((crop) => (
                <button
                  key={crop.id}
                  type="button"
                  onClick={() => setCropType(crop.id)}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition flex items-center gap-2 text-left ${
                    cropType === crop.id
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-md ring-2 ring-emerald-600/30'
                      : 'bg-slate-50 text-gray-700 border-gray-200 hover:border-emerald-300'
                  }`}
                >
                  <span className="text-lg">{crop.icon}</span>
                  <span className="truncate">{crop.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Detailed Description (ගැටලුව විස්තර කරන්න) *
            </label>
            <textarea
              required
              rows="3"
              placeholder="Describe when symptoms appeared, weather conditions, previous fertilizer applied..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
            ></textarea>
          </div>

          {/* Preferred Channel & Urgency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Preferred Channel *</label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-100 rounded-xl border border-gray-200">
                {['Chat', 'Voice', 'Video'].map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setChannel(ch)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition ${
                      channel === ch ? 'bg-emerald-700 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {ch === 'Chat' ? '💬 Chat' : ch === 'Voice' ? '📞 Voice' : '📹 Video'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Urgency Level</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold focus:ring-2 focus:ring-emerald-600 outline-none bg-white"
              >
                <option value="Normal">🟢 Normal Query</option>
                <option value="High">🟠 High Priority (Spread suspected)</option>
                <option value="Urgent Outbreak">🔴 Emergency Outbreak</option>
              </select>
            </div>

          </div>

          {/* Photo Attachment Drop Area (Crucial Requirement) */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Upload Crop Photo / Disease Image (ඡායාරූපය එක් කරන්න) *
            </label>
            
            <div className="border-2 border-dashed border-emerald-300 rounded-2xl p-4 bg-emerald-50/50 hover:bg-emerald-50 transition text-center relative cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              
              {photoPreview ? (
                <div className="relative inline-block">
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="max-h-36 rounded-xl border border-emerald-400 shadow-md object-cover mx-auto"
                  />
                  <span className="mt-2 block text-xs font-bold text-emerald-800">
                    ✓ Photo Attached (Click to change)
                  </span>
                </div>
              ) : (
                <div>
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl mx-auto mb-2">
                    📷
                  </div>
                  <p className="text-xs font-bold text-emerald-900">Click or Tap to Upload Photo</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Supports JPG, PNG (Crucial for leaf & pest identification)</p>
                </div>
              )}
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-xl shadow-md transition flex items-center gap-1.5"
            >
              <span>Submit Consultation Request</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>

        </form>

      </div>

    </div>
  );
}
